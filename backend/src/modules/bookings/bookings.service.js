// Booking business logic. Seats change ONLY on accept, inside a transaction that
// locks the ride row and re-checks availability — this is the last-seat concurrency
// guard (plan.md §11, CLAUDE.md §7). Requests and rejects never change seat counts.
import { BadRequest, Forbidden, NotFound, Conflict } from '../../lib/errors.js';

const rideSummarySelect = {
  id: true,
  origin: true,
  destination: true,
  departureAt: true,
  pricePerSeat: true,
  totalSeats: true,
  availableSeats: true,
  status: true,
  driver: { select: { id: true, name: true } },
};

const passengerSelect = { id: true, name: true, avatarUrl: true };

function shapeRide(ride) {
  return ride ? { ...ride, pricePerSeat: Number(ride.pricePerSeat) } : undefined;
}

export function toPublicBooking(b) {
  const out = {
    id: b.id,
    rideId: b.rideId,
    passengerId: b.passengerId,
    seatsBooked: b.seatsBooked,
    status: b.status,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
  if (b.ride) out.ride = shapeRide(b.ride);
  if (b.passenger) out.passenger = b.passenger;
  return out;
}

// Passenger requests seats. Creates a PENDING booking; no seat change.
export async function requestBooking(prisma, passengerId, { rideId, seatsBooked }) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) throw NotFound('Ride not found', 'RIDE_NOT_FOUND');
  if (ride.status !== 'ACTIVE') throw Conflict('Ride is not open for booking', 'RIDE_NOT_ACTIVE');
  if (new Date(ride.departureAt) <= new Date()) throw Conflict('Ride has already departed', 'RIDE_DEPARTED');
  if (ride.driverId === passengerId) throw BadRequest('You cannot book your own ride', 'SELF_BOOKING');

  const existing = await prisma.booking.findFirst({
    where: { rideId, passengerId, status: { in: ['PENDING', 'ACCEPTED'] } },
  });
  if (existing) throw Conflict('You already have an active booking on this ride', 'DUPLICATE_BOOKING');

  if (seatsBooked > ride.availableSeats) {
    throw Conflict('Not enough seats available', 'NOT_ENOUGH_SEATS');
  }

  const booking = await prisma.booking.create({
    data: { rideId, passengerId, seatsBooked, status: 'PENDING' },
    include: { ride: { select: rideSummarySelect } },
  });
  return toPublicBooking(booking);
}

// Driver accepts a request. Transactional: lock ride → re-check seats → decrement.
export async function acceptBooking(prisma, driverId, bookingId) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { ride: true } });
    if (!booking) throw NotFound('Booking not found', 'BOOKING_NOT_FOUND');
    if (booking.ride.driverId !== driverId) throw Forbidden('You do not own this ride', 'NOT_RIDE_OWNER');
    if (booking.status !== 'PENDING') throw Conflict('Booking is not pending', 'BOOKING_NOT_PENDING');

    // Serialize concurrent accepts on the same ride; re-read seats under the lock.
    await tx.$executeRaw`SELECT id FROM "Ride" WHERE id = ${booking.rideId} FOR UPDATE`;
    const ride = await tx.ride.findUnique({ where: { id: booking.rideId } });
    if (ride.status !== 'ACTIVE') throw Conflict('Ride is not active', 'RIDE_NOT_ACTIVE');
    if (new Date(ride.departureAt) <= new Date()) throw Conflict('Ride has already departed', 'RIDE_DEPARTED');
    if (ride.availableSeats < booking.seatsBooked) {
      throw Conflict('Not enough seats available', 'NOT_ENOUGH_SEATS');
    }

    await tx.ride.update({
      where: { id: booking.rideId },
      data: { availableSeats: ride.availableSeats - booking.seatsBooked },
    });
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'ACCEPTED' },
      include: { ride: { select: rideSummarySelect }, passenger: { select: passengerSelect } },
    });
    return toPublicBooking(updated);
  });
}

// Driver rejects a request. No seat change.
export async function rejectBooking(prisma, driverId, bookingId) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { ride: true } });
  if (!booking) throw NotFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (booking.ride.driverId !== driverId) throw Forbidden('You do not own this ride', 'NOT_RIDE_OWNER');
  if (booking.status !== 'PENDING') throw Conflict('Booking is not pending', 'BOOKING_NOT_PENDING');

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'REJECTED' },
    include: { ride: { select: rideSummarySelect }, passenger: { select: passengerSelect } },
  });
  return toPublicBooking(updated);
}

// Passenger cancels their own booking. Transactional: if the booking was ACCEPTED,
// restore its seats to the ride under a row lock. PENDING bookings never took seats.
export async function cancelBooking(prisma, passengerId, bookingId) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { ride: true } });
    if (!booking) throw NotFound('Booking not found', 'BOOKING_NOT_FOUND');
    if (booking.passengerId !== passengerId) throw Forbidden('You do not own this booking', 'NOT_BOOKING_OWNER');
    if (booking.status !== 'PENDING' && booking.status !== 'ACCEPTED') {
      throw Conflict('Booking cannot be cancelled', 'BOOKING_NOT_CANCELLABLE');
    }
    if (new Date(booking.ride.departureAt) <= new Date()) {
      throw Conflict('Ride has already departed', 'RIDE_DEPARTED');
    }

    // Lock the ride so a seat restore can't race a concurrent accept.
    await tx.$executeRaw`SELECT id FROM "Ride" WHERE id = ${booking.rideId} FOR UPDATE`;

    if (booking.status === 'ACCEPTED') {
      const ride = await tx.ride.findUnique({ where: { id: booking.rideId } });
      await tx.ride.update({
        where: { id: booking.rideId },
        data: { availableSeats: ride.availableSeats + booking.seatsBooked },
      });
    }

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
      include: { ride: { select: rideSummarySelect } },
    });
    return toPublicBooking(updated);
  });
}

// A passenger's own bookings.
export async function getMyBookings(prisma, passengerId) {
  const bookings = await prisma.booking.findMany({
    where: { passengerId },
    include: { ride: { select: rideSummarySelect } },
    orderBy: { createdAt: 'desc' },
  });
  return bookings.map(toPublicBooking);
}

// Incoming requests for a ride (owner only).
export async function getRideBookings(prisma, driverId, rideId) {
  const ride = await prisma.ride.findUnique({ where: { id: rideId } });
  if (!ride) throw NotFound('Ride not found', 'RIDE_NOT_FOUND');
  if (ride.driverId !== driverId) throw Forbidden('You do not own this ride', 'NOT_RIDE_OWNER');

  const bookings = await prisma.booking.findMany({
    where: { rideId },
    include: { passenger: { select: passengerSelect } },
    orderBy: { createdAt: 'asc' },
  });
  return bookings.map(toPublicBooking);
}
