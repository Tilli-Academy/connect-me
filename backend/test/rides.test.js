// Phase 4 ride tests: publish, details, owner listing, edit (ownership + seat
// recompute), and cancel. Test users/rides are namespaced and cleaned up.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app;
const TEST_DOMAIN = 'phase4.test';
const email = (n) => `user_${n}@${TEST_DOMAIN}`;

function futureISO(days = 1) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function cleanup() {
  const where = { ride: { driver: { email: { endsWith: `@${TEST_DOMAIN}` } } } };
  await app.prisma.booking.deleteMany({ where });
  await app.prisma.ride.deleteMany({ where: { driver: { email: { endsWith: `@${TEST_DOMAIN}` } } } });
  await app.prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_DOMAIN}` } } });
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

function publish(token, overrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/rides',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      origin: 'NYC',
      destination: 'Boston',
      departureAt: futureISO(1),
      totalSeats: 4,
      pricePerSeat: 25.5,
      ...overrides,
    },
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

describe('POST /api/rides', () => {
  it('publishes a ride with availableSeats = totalSeats and ACTIVE status', async () => {
    const { token } = await makeUser('pub');
    const res = await publish(token);
    expect(res.statusCode).toBe(201);
    const { ride } = res.json();
    expect(ride.availableSeats).toBe(4);
    expect(ride.totalSeats).toBe(4);
    expect(ride.status).toBe('ACTIVE');
    expect(ride.pricePerSeat).toBe(25.5);
  });

  it('rejects a past departure date (400)', async () => {
    const { token } = await makeUser('past');
    const res = await publish(token, { departureAt: new Date(Date.now() - 86400000).toISOString() });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('DEPARTURE_IN_PAST');
  });

  it('rejects missing fields (400)', async () => {
    const { token } = await makeUser('missing');
    const res = await app.inject({
      method: 'POST',
      url: '/api/rides',
      headers: { authorization: `Bearer ${token}` },
      payload: { origin: 'NYC' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated publish (401)', async () => {
    // Valid body so the request passes schema validation and reaches the auth preHandler.
    const res = await app.inject({
      method: 'POST',
      url: '/api/rides',
      payload: {
        origin: 'NYC',
        destination: 'Boston',
        departureAt: futureISO(1),
        totalSeats: 4,
        pricePerSeat: 25.5,
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/rides/:id', () => {
  it('returns public details incl. driver name but not email', async () => {
    const { token } = await makeUser('details');
    const created = (await publish(token)).json().ride;
    const res = await app.inject({ method: 'GET', url: `/api/rides/${created.id}` });
    expect(res.statusCode).toBe(200);
    const { ride } = res.json();
    expect(ride.driver.name).toBe('User details');
    expect(ride.driver).not.toHaveProperty('email');
  });

  it('404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rides/00000000-0000-0000-0000-000000000000' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/rides/mine/offered', () => {
  it('lists only the callers own rides', async () => {
    const a = await makeUser('ownerA');
    const b = await makeUser('ownerB');
    await publish(a.token);
    await publish(a.token);
    await publish(b.token);
    const res = await app.inject({
      method: 'GET',
      url: '/api/rides/mine/offered',
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rides).toHaveLength(2);
  });
});

describe('PATCH /api/rides/:id', () => {
  it('owner can edit fields; seats recompute availableSeats', async () => {
    const { token } = await makeUser('edit');
    const ride = (await publish(token)).json().ride;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/rides/${ride.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { pricePerSeat: 30, totalSeats: 6, notes: 'Trunk space' },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().ride;
    expect(updated.pricePerSeat).toBe(30);
    expect(updated.totalSeats).toBe(6);
    expect(updated.availableSeats).toBe(6); // no bookings → fully recomputed
    expect(updated.notes).toBe('Trunk space');
  });

  it('non-owner cannot edit (403)', async () => {
    const owner = await makeUser('ownerEdit');
    const other = await makeUser('intruder');
    const ride = (await publish(owner.token)).json().ride;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/rides/${ride.id}`,
      headers: { authorization: `Bearer ${other.token}` },
      payload: { pricePerSeat: 1 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_RIDE_OWNER');
  });
});

describe('DELETE /api/rides/:id', () => {
  it('owner can cancel (status CANCELLED)', async () => {
    const { token } = await makeUser('cancel');
    const ride = (await publish(token)).json().ride;
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/rides/${ride.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ride.status).toBe('CANCELLED');
  });

  it('cancelling an already-cancelled ride returns 409', async () => {
    const { token } = await makeUser('cancel2');
    const ride = (await publish(token)).json().ride;
    await app.inject({ method: 'DELETE', url: `/api/rides/${ride.id}`, headers: { authorization: `Bearer ${token}` } });
    const res = await app.inject({ method: 'DELETE', url: `/api/rides/${ride.id}`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(409);
  });

  it('editing a cancelled ride returns 409', async () => {
    const { token } = await makeUser('editcancelled');
    const ride = (await publish(token)).json().ride;
    await app.inject({ method: 'DELETE', url: `/api/rides/${ride.id}`, headers: { authorization: `Bearer ${token}` } });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/rides/${ride.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { pricePerSeat: 5 },
    });
    expect(res.statusCode).toBe(409);
  });
});
