// Phase 6 booking tests: request/accept/reject, seat accounting, ownership,
// and the critical last-seat concurrency guard.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app;
const TEST_DOMAIN = 'phase6.test';
const email = (n) => `user_${n}@${TEST_DOMAIN}`;

async function cleanup() {
  const byDomain = { endsWith: `@${TEST_DOMAIN}` };
  await app.prisma.booking.deleteMany({ where: { passenger: { email: byDomain } } });
  await app.prisma.booking.deleteMany({ where: { ride: { driver: { email: byDomain } } } });
  await app.prisma.ride.deleteMany({ where: { driver: { email: byDomain } } });
  await app.prisma.user.deleteMany({ where: { email: byDomain } });
}

async function makeUser(n) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: email(n), password: 'secret123', name: `User ${n}` },
  });
  const { token, user } = res.json();
  return { token, id: user.id };
}

async function publishRide(token, overrides = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/rides',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      origin: 'A',
      destination: 'B',
      departureAt: new Date(Date.now() + 86400000).toISOString(),
      totalSeats: 4,
      pricePerSeat: 10,
      ...overrides,
    },
  });
  return res.json().ride;
}

function request(token, rideId, seatsBooked = 1) {
  return app.inject({
    method: 'POST',
    url: '/api/bookings',
    headers: { authorization: `Bearer ${token}` },
    payload: { rideId, seatsBooked },
  });
}

beforeAll(async () => {
  app = await buildApp({ logger: false, rateLimit: false });
  await app.ready();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await app.close();
});

describe('POST /api/bookings (request)', () => {
  it('creates a PENDING booking without changing seats', async () => {
    const driver = await makeUser('d1');
    const pax = await makeUser('p1');
    const ride = await publishRide(driver.token);
    const res = await request(pax.token, ride.id, 2);
    expect(res.statusCode).toBe(201);
    expect(res.json().booking.status).toBe('PENDING');

    const after = await app.inject({ method: 'GET', url: `/api/rides/${ride.id}` });
    expect(after.json().ride.availableSeats).toBe(4); // unchanged until accept
  });

  it('rejects booking your own ride (400)', async () => {
    const driver = await makeUser('d2');
    const ride = await publishRide(driver.token);
    const res = await request(driver.token, ride.id, 1);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('SELF_BOOKING');
  });

  it('rejects a duplicate active booking (409)', async () => {
    const driver = await makeUser('d3');
    const pax = await makeUser('p3');
    const ride = await publishRide(driver.token);
    await request(pax.token, ride.id, 1);
    const res = await request(pax.token, ride.id, 1);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DUPLICATE_BOOKING');
  });

  it('rejects requesting more seats than available (409)', async () => {
    const driver = await makeUser('d4');
    const pax = await makeUser('p4');
    const ride = await publishRide(driver.token, { totalSeats: 2 });
    const res = await request(pax.token, ride.id, 3);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NOT_ENOUGH_SEATS');
  });

  it('rejects booking a cancelled ride (409)', async () => {
    const driver = await makeUser('d5');
    const pax = await makeUser('p5');
    const ride = await publishRide(driver.token);
    await app.inject({ method: 'DELETE', url: `/api/rides/${ride.id}`, headers: { authorization: `Bearer ${driver.token}` } });
    const res = await request(pax.token, ride.id, 1);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('RIDE_NOT_ACTIVE');
  });
});

describe('PATCH /api/bookings/:id/accept', () => {
  it('owner accepts; seats decrement by seatsBooked', async () => {
    const driver = await makeUser('d6');
    const pax = await makeUser('p6');
    const ride = await publishRide(driver.token);
    const booking = (await request(pax.token, ride.id, 2)).json().booking;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/bookings/${booking.id}/accept`,
      headers: { authorization: `Bearer ${driver.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.status).toBe('ACCEPTED');

    const after = await app.inject({ method: 'GET', url: `/api/rides/${ride.id}` });
    expect(after.json().ride.availableSeats).toBe(2); // 4 - 2
  });

  it('non-owner cannot accept (403)', async () => {
    const driver = await makeUser('d7');
    const pax = await makeUser('p7');
    const intruder = await makeUser('i7');
    const ride = await publishRide(driver.token);
    const booking = (await request(pax.token, ride.id, 1)).json().booking;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/bookings/${booking.id}/accept`,
      headers: { authorization: `Bearer ${intruder.token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('accepting a non-pending booking returns 409', async () => {
    const driver = await makeUser('d8');
    const pax = await makeUser('p8');
    const ride = await publishRide(driver.token);
    const booking = (await request(pax.token, ride.id, 1)).json().booking;
    await app.inject({ method: 'PATCH', url: `/api/bookings/${booking.id}/accept`, headers: { authorization: `Bearer ${driver.token}` } });
    const res = await app.inject({ method: 'PATCH', url: `/api/bookings/${booking.id}/accept`, headers: { authorization: `Bearer ${driver.token}` } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('BOOKING_NOT_PENDING');
  });
});

describe('PATCH /api/bookings/:id/reject', () => {
  it('owner rejects without changing seats', async () => {
    const driver = await makeUser('d9');
    const pax = await makeUser('p9');
    const ride = await publishRide(driver.token);
    const booking = (await request(pax.token, ride.id, 2)).json().booking;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/bookings/${booking.id}/reject`,
      headers: { authorization: `Bearer ${driver.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.status).toBe('REJECTED');

    const after = await app.inject({ method: 'GET', url: `/api/rides/${ride.id}` });
    expect(after.json().ride.availableSeats).toBe(4);
  });
});

describe('GET /api/bookings/mine and /api/rides/:id/bookings', () => {
  it('passenger sees own bookings; owner sees ride requests; non-owner 403', async () => {
    const driver = await makeUser('d10');
    const pax = await makeUser('p10');
    const other = await makeUser('o10');
    const ride = await publishRide(driver.token);
    await request(pax.token, ride.id, 1);

    const mine = await app.inject({ method: 'GET', url: '/api/bookings/mine', headers: { authorization: `Bearer ${pax.token}` } });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().bookings.length).toBeGreaterThanOrEqual(1);

    const owner = await app.inject({ method: 'GET', url: `/api/rides/${ride.id}/bookings`, headers: { authorization: `Bearer ${driver.token}` } });
    expect(owner.statusCode).toBe(200);
    expect(owner.json().bookings[0].passenger.name).toBe('User p10');

    const nonOwner = await app.inject({ method: 'GET', url: `/api/rides/${ride.id}/bookings`, headers: { authorization: `Bearer ${other.token}` } });
    expect(nonOwner.statusCode).toBe(403);
  });
});

describe('CONCURRENCY: last-seat race', () => {
  it('two simultaneous accepts for the last seat → exactly one succeeds, seats never negative', async () => {
    const driver = await makeUser('dc');
    const pax1 = await makeUser('pc1');
    const pax2 = await makeUser('pc2');
    const ride = await publishRide(driver.token, { totalSeats: 1 }); // single seat

    const b1 = (await request(pax1.token, ride.id, 1)).json().booking;
    const b2 = (await request(pax2.token, ride.id, 1)).json().booking;

    // Fire both accepts concurrently.
    const [r1, r2] = await Promise.all([
      app.inject({ method: 'PATCH', url: `/api/bookings/${b1.id}/accept`, headers: { authorization: `Bearer ${driver.token}` } }),
      app.inject({ method: 'PATCH', url: `/api/bookings/${b2.id}/accept`, headers: { authorization: `Bearer ${driver.token}` } }),
    ]);

    const statuses = [r1.statusCode, r2.statusCode].sort();
    expect(statuses).toEqual([200, 409]); // exactly one success, one conflict

    const after = await app.inject({ method: 'GET', url: `/api/rides/${ride.id}` });
    expect(after.json().ride.availableSeats).toBe(0); // never negative
  });
});

describe('PATCH /api/bookings/:id/cancel (passenger cancellation)', () => {
  it('cancels a PENDING booking without changing seats', async () => {
    const driver = await makeUser('cx1d');
    const pax = await makeUser('cx1p');
    const ride = await publishRide(driver.token);
    const booking = (await request(pax.token, ride.id, 2)).json().booking;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/bookings/${booking.id}/cancel`,
      headers: { authorization: `Bearer ${pax.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.status).toBe('CANCELLED');

    const after = await app.inject({ method: 'GET', url: `/api/rides/${ride.id}` });
    expect(after.json().ride.availableSeats).toBe(4); // unchanged
  });

  it('cancels an ACCEPTED booking and restores seats', async () => {
    const driver = await makeUser('cx2d');
    const pax = await makeUser('cx2p');
    const ride = await publishRide(driver.token); // 4 seats
    const booking = (await request(pax.token, ride.id, 2)).json().booking;
    await app.inject({ method: 'PATCH', url: `/api/bookings/${booking.id}/accept`, headers: { authorization: `Bearer ${driver.token}` } });

    let r = await app.inject({ method: 'GET', url: `/api/rides/${ride.id}` });
    expect(r.json().ride.availableSeats).toBe(2); // decremented on accept

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/bookings/${booking.id}/cancel`,
      headers: { authorization: `Bearer ${pax.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.status).toBe('CANCELLED');

    r = await app.inject({ method: 'GET', url: `/api/rides/${ride.id}` });
    expect(r.json().ride.availableSeats).toBe(4); // restored
  });

  it('non-owner cannot cancel (403)', async () => {
    const driver = await makeUser('cx3d');
    const pax = await makeUser('cx3p');
    const other = await makeUser('cx3o');
    const ride = await publishRide(driver.token);
    const booking = (await request(pax.token, ride.id, 1)).json().booking;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/bookings/${booking.id}/cancel`,
      headers: { authorization: `Bearer ${other.token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_BOOKING_OWNER');
  });

  it('repeated cancel returns 409', async () => {
    const driver = await makeUser('cx4d');
    const pax = await makeUser('cx4p');
    const ride = await publishRide(driver.token);
    const booking = (await request(pax.token, ride.id, 1)).json().booking;
    await app.inject({ method: 'PATCH', url: `/api/bookings/${booking.id}/cancel`, headers: { authorization: `Bearer ${pax.token}` } });
    const res = await app.inject({ method: 'PATCH', url: `/api/bookings/${booking.id}/cancel`, headers: { authorization: `Bearer ${pax.token}` } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('BOOKING_NOT_CANCELLABLE');
  });

  it('cannot cancel after departure (409)', async () => {
    const driver = await makeUser('cx5d');
    const pax = await makeUser('cx5p');
    // Seed a past-departure ride + booking directly (the API blocks publishing in the past).
    const ride = await app.prisma.ride.create({
      data: { driverId: driver.id, origin: 'A', destination: 'B', departureAt: new Date(Date.now() - 3600000), totalSeats: 4, availableSeats: 4, pricePerSeat: 10, status: 'ACTIVE' },
    });
    const booking = await app.prisma.booking.create({
      data: { rideId: ride.id, passengerId: pax.id, seatsBooked: 1, status: 'PENDING' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/bookings/${booking.id}/cancel`,
      headers: { authorization: `Bearer ${pax.token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('RIDE_DEPARTED');
  });

  it('cancel after accept restores seats so another passenger can be accepted (transaction-safe round-trip)', async () => {
    const driver = await makeUser('cx6d');
    const p1 = await makeUser('cx6p1');
    const p2 = await makeUser('cx6p2');
    const ride = await publishRide(driver.token, { totalSeats: 1 }); // single seat
    const b1 = (await request(p1.token, ride.id, 1)).json().booking;
    const b2 = (await request(p2.token, ride.id, 1)).json().booking;

    await app.inject({ method: 'PATCH', url: `/api/bookings/${b1.id}/accept`, headers: { authorization: `Bearer ${driver.token}` } });
    // Seat gone → accepting b2 fails.
    const blocked = await app.inject({ method: 'PATCH', url: `/api/bookings/${b2.id}/accept`, headers: { authorization: `Bearer ${driver.token}` } });
    expect(blocked.statusCode).toBe(409);

    // p1 cancels → seat restored → b2 can now be accepted.
    await app.inject({ method: 'PATCH', url: `/api/bookings/${b1.id}/cancel`, headers: { authorization: `Bearer ${p1.token}` } });
    const ok = await app.inject({ method: 'PATCH', url: `/api/bookings/${b2.id}/accept`, headers: { authorization: `Bearer ${driver.token}` } });
    expect(ok.statusCode).toBe(200);

    const after = await app.inject({ method: 'GET', url: `/api/rides/${ride.id}` });
    expect(after.json().ride.availableSeats).toBe(0);
  });
});

describe('GET /api/rides/mine/offered — pendingCount', () => {
  it('reports the number of pending requests per ride', async () => {
    const driver = await makeUser('pc_d');
    const p1 = await makeUser('pc_p1');
    const p2 = await makeUser('pc_p2');
    const ride = await publishRide(driver.token);
    await request(p1.token, ride.id, 1);
    await request(p2.token, ride.id, 1);

    const res = await app.inject({ method: 'GET', url: '/api/rides/mine/offered', headers: { authorization: `Bearer ${driver.token}` } });
    const mine = res.json().rides.find((r) => r.id === ride.id);
    expect(mine.pendingCount).toBe(2);
  });
});
