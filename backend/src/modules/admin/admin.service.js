// Admin business logic (Phase 10): platform statistics, user/ride listing and
// viewing, and deactivation/reactivation. All reads use Prisma `select`/`include`
// so passwordHash is never returned. Single-row writes need no transaction.
import { NotFound, Forbidden, Conflict } from '../../lib/errors.js';
import { toPublicRide } from '../rides/rides.service.js';

// Admin user view: includes moderation fields (role, isActive) but never passwordHash.
const adminUserSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  bio: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

// Admin ride view may include driver contact details (email) since the caller is privileged.
const adminRideDriverSelect = { id: true, name: true, email: true };

const RIDE_STATUSES = ['ACTIVE', 'CANCELLED', 'COMPLETED', 'SUSPENDED'];
const BOOKING_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'];

// Turn a Prisma groupBy result into a { STATUS: count } map with every status
// present (zero-filled), so the dashboard always renders a stable shape.
function countsByStatus(groups, allStatuses) {
  const counts = Object.fromEntries(allStatuses.map((s) => [s, 0]));
  for (const g of groups) counts[g.status] = g._count._all;
  return counts;
}

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

export async function getStats(prisma) {
  const [userTotal, userActive, rideGroups, bookingGroups] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.ride.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const ridesByStatus = countsByStatus(rideGroups, RIDE_STATUSES);
  const bookingsByStatus = countsByStatus(bookingGroups, BOOKING_STATUSES);

  return {
    users: { total: userTotal, active: userActive, deactivated: userTotal - userActive },
    rides: { total: sum(ridesByStatus), byStatus: ridesByStatus },
    bookings: { total: sum(bookingsByStatus), byStatus: bookingsByStatus },
  };
}

export async function listUsers(prisma, { limit = 20, offset = 0 } = {}) {
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      select: adminUserSelect,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.user.count(),
  ]);
  return { items, total, limit, offset };
}

export async function getUser(prisma, id) {
  const user = await prisma.user.findUnique({ where: { id }, select: adminUserSelect });
  if (!user) throw NotFound('User not found', 'USER_NOT_FOUND');
  return user;
}

export async function setUserActive(prisma, actingAdminId, id, isActive) {
  // An admin must not lock themselves out of the platform.
  if (!isActive && id === actingAdminId) {
    throw Forbidden('Admins cannot deactivate their own account', 'ADMIN_SELF_DEACTIVATION');
  }
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw NotFound('User not found', 'USER_NOT_FOUND');
  return prisma.user.update({ where: { id }, data: { isActive }, select: adminUserSelect });
}

export async function listRides(prisma, { limit = 20, offset = 0 } = {}) {
  const [items, total] = await Promise.all([
    prisma.ride.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { driver: { select: adminRideDriverSelect } },
    }),
    prisma.ride.count(),
  ]);
  return { items: items.map(toPublicRide), total, limit, offset };
}

export async function getRide(prisma, id) {
  const ride = await prisma.ride.findUnique({
    where: { id },
    include: { driver: { select: adminRideDriverSelect } },
  });
  if (!ride) throw NotFound('Ride not found', 'RIDE_NOT_FOUND');
  return toPublicRide(ride);
}

// Moderation: deactivate (ACTIVE → SUSPENDED) or reactivate (SUSPENDED → ACTIVE).
// Driver-owned CANCELLED/COMPLETED rides are left out of this state machine so an
// admin can't accidentally resurrect a ride the driver cancelled. Seat counts and
// bookings are untouched — SUSPENDED simply drops the ride out of search.
export async function setRideActive(prisma, id, active) {
  const ride = await prisma.ride.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!ride) throw NotFound('Ride not found', 'RIDE_NOT_FOUND');

  if (active) {
    if (ride.status !== 'SUSPENDED') {
      throw Conflict('Only suspended rides can be reactivated', 'RIDE_NOT_SUSPENDED');
    }
  } else if (ride.status !== 'ACTIVE') {
    throw Conflict('Only active rides can be suspended', 'RIDE_NOT_ACTIVE');
  }

  const updated = await prisma.ride.update({
    where: { id },
    data: { status: active ? 'ACTIVE' : 'SUSPENDED' },
    include: { driver: { select: adminRideDriverSelect } },
  });
  return toPublicRide(updated);
}
