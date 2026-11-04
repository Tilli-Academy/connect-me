// Phase 8 hardening tests: security headers, departed-ride accept guard,
// and auth rate limiting (with the limiter explicitly enabled).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

const TEST_DOMAIN = 'phase8.test';
const email = (n) => `user_${n}@${TEST_DOMAIN}`;

async function cleanup(app) {
  const byDomain = { endsWith: `@${TEST_DOMAIN}` };
  await app.prisma.booking.deleteMany({ where: { passenger: { email: byDomain } } });
  await app.prisma.booking.deleteMany({ where: { ride: { driver: { email: byDomain } } } });
  await app.prisma.ride.deleteMany({ where: { driver: { email: byDomain } } });
  await app.prisma.user.deleteMany({ where: { email: byDomain } });
}

async function makeUser(app, n) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: email(n), password: 'secret123', name: `User ${n}` },
  });
  const { token, user } = res.json();
  return { token, id: user.id };
}

describe('Security headers (helmet)', () => {
  let app;
  beforeAll(async () => {
    app = await buildApp({ logger: false, rateLimit: false });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('sets hardening headers on responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers).toHaveProperty('x-frame-options');
  });
});

describe('Accept on a departed ride is blocked (edge case)', () => {
  let app;
  beforeAll(async () => {
    app = await buildApp({ logger: false, rateLimit: false });
    await app.ready();
    await cleanup(app);
  });
  afterAll(async () => {
    await cleanup(app);
    await app.close();
  });

  it('returns 409 RIDE_DEPARTED', async () => {
    const driver = await makeUser(app, 'dd');
    const pax = await makeUser(app, 'pd');
    // Seed a past-departure ride + pending booking (API blocks publishing in the past).
    const ride = await app.prisma.ride.create({
      data: { driverId: driver.id, origin: 'A', destination: 'B', departureAt: new Date(Date.now() - 3600000), totalSeats: 4, availableSeats: 4, pricePerSeat: 10, status: 'ACTIVE' },
    });
    const booking = await app.prisma.booking.create({
      data: { rideId: ride.id, passengerId: pax.id, seatsBooked: 1, status: 'PENDING' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/bookings/${booking.id}/accept`,
      headers: { authorization: `Bearer ${driver.token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('RIDE_DEPARTED');
  });
});

describe('Auth rate limiting (limiter enabled)', () => {
  let app;
  beforeAll(async () => {
    app = await buildApp({ logger: false, rateLimit: true });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('throttles rapid login attempts with 429 (limit 10/min)', async () => {
    const codes = [];
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: email('nobody'), password: 'whatever1' },
      });
      codes.push(res.statusCode);
    }
    expect(codes).toContain(429); // throttled before all 12 complete
  });
});
