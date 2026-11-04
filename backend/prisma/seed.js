// Demo/seed data for local development and manual testing (plan.md Phase 9).
//
// Idempotent: all demo records live under the @demo.carpool email domain and are
// wiped + recreated on every run, so `npm run db:seed` is safe to repeat.
//
// These are DEV-ONLY demo accounts with a well-known throwaway password. They are
// not secrets and must never be used in a real deployment.
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/hash.js';

const prisma = new PrismaClient();

const DEMO_DOMAIN = '@demo.carpool';
const DEMO_PASSWORD = 'password123'; // dev-only; shown in the README for convenience

// Keep demo departures in the future so seeded rides show up in search.
function inDays(days, hour = 9) {
  const d = new Date(Date.now() + days * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function wipeDemoData() {
  const byDomain = { endsWith: DEMO_DOMAIN };
  // Order matters: bookings reference rides and users; rides reference users.
  await prisma.booking.deleteMany({
    where: {
      OR: [
        { passenger: { email: byDomain } },
        { ride: { driver: { email: byDomain } } },
      ],
    },
  });
  await prisma.ride.deleteMany({ where: { driver: { email: byDomain } } });
  await prisma.user.deleteMany({ where: { email: byDomain } });
}

async function createUser({ email, name, phone, bio, role }) {
  return prisma.user.create({
    // role omitted → Prisma applies the USER default.
    data: { email, name, phone, bio, role, passwordHash: await hashPassword(DEMO_PASSWORD) },
  });
}

async function main() {
  await wipeDemoData();

  // Three demo users. Roles are per-action, so the same account can drive and ride.
  const alice = await createUser({
    email: `alice${DEMO_DOMAIN}`,
    name: 'Alice Driver',
    phone: '+1 555 0101',
    bio: 'Daily commuter, happy to share the ride.',
  });
  const bob = await createUser({
    email: `bob${DEMO_DOMAIN}`,
    name: 'Bob Passenger',
    phone: '+1 555 0102',
    bio: 'Looking for rides into the city.',
  });
  const carol = await createUser({
    email: `carol${DEMO_DOMAIN}`,
    name: 'Carol Both',
    phone: '+1 555 0103',
    bio: 'Sometimes I drive, sometimes I ride.',
  });

  // Dev-only admin account for exercising the Phase 10 admin module. Admins are
  // provisioned here (or by a direct DB update), never via a public endpoint.
  await createUser({
    email: `admin${DEMO_DOMAIN}`,
    name: 'Admin User',
    phone: '+1 555 0100',
    bio: 'Platform administrator (demo).',
    role: 'ADMIN',
  });

  // Alice publishes two rides. availableSeats is the authoritative denormalized
  // count; we set it explicitly to stay consistent with any seeded bookings.
  const ride1 = await prisma.ride.create({
    data: {
      driverId: alice.id,
      origin: 'Springfield',
      destination: 'Shelbyville',
      departureAt: inDays(1),
      totalSeats: 3,
      availableSeats: 2, // one seat consumed by Bob's accepted booking below
      pricePerSeat: 12.5,
      notes: 'Two stops along the highway; small bags only.',
      status: 'ACTIVE',
    },
  });
  const ride2 = await prisma.ride.create({
    data: {
      driverId: carol.id,
      origin: 'Springfield',
      destination: 'Capital City',
      departureAt: inDays(2, 8),
      totalSeats: 4,
      availableSeats: 4,
      pricePerSeat: 20,
      status: 'ACTIVE',
    },
  });

  // Bob has one ACCEPTED booking on ride1 (hence ride1.availableSeats = 2) and one
  // PENDING request on ride2 awaiting Carol's decision (pending does not hold a seat).
  await prisma.booking.create({
    data: { rideId: ride1.id, passengerId: bob.id, seatsBooked: 1, status: 'ACCEPTED' },
  });
  await prisma.booking.create({
    data: { rideId: ride2.id, passengerId: bob.id, seatsBooked: 1, status: 'PENDING' },
  });

  console.log('Seeded demo data:');
  console.log(`  users:    alice, bob, carol, admin (ADMIN)  (all ${DEMO_DOMAIN}, password "${DEMO_PASSWORD}")`);
  console.log('  rides:    Springfield→Shelbyville (Alice), Springfield→Capital City (Carol)');
  console.log('  bookings: Bob ACCEPTED on ride 1, Bob PENDING on ride 2');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
