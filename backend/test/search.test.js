// Phase 5 search tests: filtering by origin/destination/date, exclusion of
// full/cancelled/past rides, case-insensitivity, and own-ride exclusion.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app;
const TEST_DOMAIN = 'phase5.test';
const email = (n) => `user_${n}@${TEST_DOMAIN}`;

let driverId;
let driverToken;
let dateStr; // tomorrow (UTC) YYYY-MM-DD

async function cleanup() {
  await app.prisma.ride.deleteMany({ where: { driver: { email: { endsWith: `@${TEST_DOMAIN}` } } } });
  await app.prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_DOMAIN}` } } });
}

// Unique origin/destination tokens so results are deterministic even when other
// test files seed rides into the shared DB in parallel.
const ORIGIN = 'P5Origin';
const DEST = 'P5Dest';
const OTHER_DEST = 'P5Other';

function seedRide(overrides) {
  const base = new Date(`${dateStr}T12:00:00.000Z`);
  return app.prisma.ride.create({
    data: {
      driverId,
      origin: ORIGIN,
      destination: DEST,
      departureAt: base,
      totalSeats: 4,
      availableSeats: 3,
      pricePerSeat: 25.5,
      status: 'ACTIVE',
      ...overrides,
    },
  });
}

beforeAll(async () => {
  app = await buildApp({ logger: false, rateLimit: false });
  await app.ready();
  await cleanup();

  const reg = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: email('driver'), password: 'secret123', name: 'Driver' },
  });
  driverToken = reg.json().token;
  driverId = reg.json().user.id;

  dateStr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  await seedRide({}); // R1 match
  await seedRide({ origin: ORIGIN.toLowerCase(), destination: DEST.toLowerCase() }); // R2 case-insensitive match
  await seedRide({ availableSeats: 0 }); // R3 full -> excluded
  await seedRide({ status: 'CANCELLED' }); // R4 cancelled -> excluded
  await seedRide({ departureAt: new Date(Date.now() - 86400000) }); // R5 past -> excluded
  await seedRide({ destination: OTHER_DEST }); // R6 different destination
});

afterAll(async () => {
  await cleanup();
  await app.close();
});

describe('GET /api/rides (search)', () => {
  it('returns only ACTIVE, seat-available, matching, future rides', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/rides?origin=${ORIGIN}&destination=${DEST}&date=${dateStr}`,
    });
    expect(res.statusCode).toBe(200);
    const { rides } = res.json();
    // R1 + R2 (case-insensitive); R3 full, R4 cancelled, R5 past, R6 other dest excluded.
    expect(rides).toHaveLength(2);
    expect(rides.every((r) => r.status === 'ACTIVE' && r.availableSeats > 0)).toBe(true);
  });

  it('matches case-insensitively', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/rides?origin=${ORIGIN.toLowerCase()}&destination=${DEST.toUpperCase()}&date=${dateStr}`,
    });
    expect(res.json().rides).toHaveLength(2);
  });

  it('filters by destination', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/rides?destination=${OTHER_DEST}&date=${dateStr}` });
    const { rides } = res.json();
    expect(rides).toHaveLength(1);
    expect(rides[0].destination).toBe(OTHER_DEST);
  });

  it('excludes the caller\'s own rides when authenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/rides?origin=${ORIGIN}&destination=${DEST}&date=${dateStr}`,
      headers: { authorization: `Bearer ${driverToken}` },
    });
    expect(res.json().rides).toHaveLength(0); // all seeded rides belong to the caller
  });

  it('rejects a malformed date (400)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rides?date=11-04-2026' });
    expect(res.statusCode).toBe(400);
  });

  it('includes driver name but not email', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/rides?origin=${ORIGIN}&destination=${DEST}&date=${dateStr}` });
    const ride = res.json().rides[0];
    expect(ride.driver.name).toBe('Driver');
    expect(ride.driver).not.toHaveProperty('email');
  });
});
