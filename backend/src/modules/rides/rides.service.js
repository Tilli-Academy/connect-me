// Ride business logic: publishing, details, owner listing, editing, cancellation.
// Seat-affecting writes (edit totalSeats, cancel) run inside a transaction with a
// row lock on the ride, consistent with the booking-concurrency model (CLAUDE.md §7).
import { BadRequest, Forbidden, NotFound, Conflict } from '../../lib/errors.js';

const driverSelect = { id: true, name: true, avatarUrl: true };

// Public ride shape. Driver contact details (email/phone) are never exposed here.
export function toPublicRide(ride) {
  const { driver, ...rest } = ride;
  return {
    ...rest,
    pricePerSeat: Number(ride.pricePerSeat),
    ...(driver ? { driver } : {}),
  };
}

function assertFutureDeparture(value) {
  const departure = new Date(value);
  if (Number.isNaN(departure.getTime()) || departure <= new Date()) {
    throw BadRequest('Departure time must be in the future', 'DEPARTURE_IN_PAST');
  }
  return departure;
}

export async function createRide(prisma, driverId, body) {
  const departureAt = assertFutureDeparture(body.departureAt);
  const ride = await prisma.ride.create({
    data: {
      driverId,
      origin: body.origin,
      destination: body.destination,
      departureAt,
      totalSeats: body.totalSeats,
      availableSeats: body.totalSeats, // all seats open at publish time
      pricePerSeat: body.pricePerSeat,
      notes: body.notes ?? null,
    },
  });
  return toPublicRide(ride);
}

export async function getRideById(prisma, id) {
  const ride = await prisma.ride.findUnique({
    where: { id },
    include: { driver: { select: driverSelect } },
  });
  if (!ride) throw NotFound('Ride not found', 'RIDE_NOT_FOUND');
  return toPublicRide(ride);
}

// Bookable-ride search. Only ACTIVE rides with open seats and a future departure.
// Origin/destination match case-insensitively; `date` limits to that UTC day.
// When excludeDriverId is set (authenticated caller), their own rides are hidden.
export async function searchRides(prisma, { origin, destination, date }, excludeDriverId) {
  const now = new Date();
  const where = {
    status: 'ACTIVE',
    availableSeats: { gt: 0 },
  };

  if (origin) where.origin = { equals: origin, mode: 'insensitive' };
  if (destination) where.destination = { equals: destination, mode: 'insensitive' };

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 86400000);
    // Don't surface departures already in the past, even earlier today.
    where.departureAt = { gte: start > now ? start : now, lt: end };
  } else {
    where.departureAt = { gte: now };
  }

  if (excludeDriverId) where.driverId = { not: excludeDriverId };

  const rides = await prisma.ride.findMany({
    where,
    orderBy: { departureAt: 'asc' },
    include: { driver: { select: driverSelect } },
  });
  return rides.map(toPublicRide);
}

export async function getOwnedRides(prisma, driverId) {
  const rides = await prisma.ride.findMany({
    where: { driverId },
    orderBy: { departureAt: 'asc' },
  });

  // Count pending requests per ride so the My Rides dashboard can surface them.
  const pending = await prisma.booking.groupBy({
    by: ['rideId'],
    where: { ride: { driverId }, status: 'PENDING' },
    _count: { _all: true },
  });
  const pendingByRide = Object.fromEntries(pending.map((p) => [p.rideId, p._count._all]));

  return rides.map((ride) => ({ ...toPublicRide(ride), pendingCount: pendingByRide[ride.id] ?? 0 }));
}

export async function updateRide(prisma, driverId, id, body) {
  return prisma.$transaction(async (tx) => {
    // Lock the ride row so seat recomputation can't race a concurrent booking accept.
    await tx.$executeRaw`SELECT id FROM "Ride" WHERE id = ${id} FOR UPDATE`;
    const ride = await tx.ride.findUnique({ where: { id } });
    if (!ride) throw NotFound('Ride not found', 'RIDE_NOT_FOUND');
    if (ride.driverId !== driverId) throw Forbidden('You do not own this ride', 'NOT_RIDE_OWNER');
    if (ride.status !== 'ACTIVE') throw Conflict('Only active rides can be edited', 'RIDE_NOT_EDITABLE');

    const data = {};
    if (body.origin !== undefined) data.origin = body.origin;
    if (body.destination !== undefined) data.destination = body.destination;
    if (body.pricePerSeat !== undefined) data.pricePerSeat = body.pricePerSeat;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.departureAt !== undefined) data.departureAt = assertFutureDeparture(body.departureAt);

    if (body.totalSeats !== undefined) {
      const seatsTaken = ride.totalSeats - ride.availableSeats;
      if (body.totalSeats < seatsTaken) {
        throw Conflict(
          `Cannot set seats below ${seatsTaken} already booked`,
          'SEATS_BELOW_BOOKED',
        );
      }
      data.totalSeats = body.totalSeats;
      data.availableSeats = body.totalSeats - seatsTaken;
    }

    const updated = await tx.ride.update({ where: { id }, data });
    return toPublicRide(updated);
  });
}

export async function cancelRide(prisma, driverId, id) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Ride" WHERE id = ${id} FOR UPDATE`;
    const ride = await tx.ride.findUnique({ where: { id } });
    if (!ride) throw NotFound('Ride not found', 'RIDE_NOT_FOUND');
    if (ride.driverId !== driverId) throw Forbidden('You do not own this ride', 'NOT_RIDE_OWNER');
    if (ride.status !== 'ACTIVE') throw Conflict('Ride is not active', 'RIDE_NOT_ACTIVE');

    // Cascade: any outstanding requests/bookings are cancelled with the ride.
    await tx.booking.updateMany({
      where: { rideId: id, status: { in: ['PENDING', 'ACCEPTED'] } },
      data: { status: 'CANCELLED' },
    });

    const updated = await tx.ride.update({ where: { id }, data: { status: 'CANCELLED' } });
    return toPublicRide(updated);
  });
}
