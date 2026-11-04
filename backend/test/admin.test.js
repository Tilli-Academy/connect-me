// Phase 10 admin tests: role-based access control, dashboard statistics,
// user/ride deactivation effects, and the self-deactivation guard. Test data is
// namespaced under @phase10.test and cleaned up; an admin is provisioned by
// promoting a freshly-registered user directly in the DB (no public promote path).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app;
const TEST_DOMAIN = 'phase10.test';
const email = (n) => `user_${n}@${TEST_DOMAIN}`;

function futureISO(days = 1) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

async function cleanup() {
  const byDomain = { endsWith: `@${TEST_DOMAIN}` };
  await app.prisma.booking.deleteMany({
    where: { OR: [{ passenger: { email: byDomain } }, { ride: { driver: { email: byDomain } } }] },
  });
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

// Register a user, promote to ADMIN in the DB, then log in so the token carries role=ADMIN.
async function makeAdmin(n) {
  const u = await makeUser(n);
  await app.prisma.user.update({ where: { id: u.id }, data: { role: 'ADMIN' } });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: email(n), password: 'secret123' },
  });
  return { token: res.json().token, id: u.id };
}

function publish(token, overrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/rides',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      origin: 'P10Origin',
      destination: 'P10Dest',
      departureAt: futureISO(1),
      totalSeats: 4,
      pricePerSeat: 10,
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

describe('Admin RBAC', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/stats' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a non-admin user with 403 ADMIN_ONLY', async () => {
    const { token } = await makeUser('plain');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ADMIN_ONLY');
  });

  it('allows an admin', async () => {
    const admin = await makeAdmin('rbacadmin');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/stats',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('Admin dashboard statistics', () => {
  it('returns a consistent, fully-keyed stats shape', async () => {
    const admin = await makeAdmin('statsadmin');
    const { stats } = (
      await app.inject({ method: 'GET', url: '/api/admin/stats', headers: { authorization: `Bearer ${admin.token}` } })
    ).json();

    // Invariants that hold regardless of other data in the shared test DB.
    expect(stats.users.total).toBe(stats.users.active + stats.users.deactivated);
    expect(Object.keys(stats.rides.byStatus).sort()).toEqual(['ACTIVE', 'CANCELLED', 'COMPLETED', 'SUSPENDED']);
    expect(Object.keys(stats.bookings.byStatus).sort()).toEqual(['ACCEPTED', 'CANCELLED', 'PENDING', 'REJECTED']);
    const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(stats.rides.total).toBe(sum(stats.rides.byStatus));
    expect(stats.bookings.total).toBe(sum(stats.bookings.byStatus));
  });

  it('reflects a deactivation in the deactivated count', async () => {
    const admin = await makeAdmin('countadmin');
    const victim = await makeUser('counted');
    // Only admin action changes the deactivated count, so its delta is stable even
    // though other suites concurrently create/clean up (active) users in the shared DB.
    const before = (
      await app.inject({ method: 'GET', url: '/api/admin/stats', headers: { authorization: `Bearer ${admin.token}` } })
    ).json().stats.users;

    await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${victim.id}/deactivate`,
      headers: { authorization: `Bearer ${admin.token}` },
    });

    const after = (
      await app.inject({ method: 'GET', url: '/api/admin/stats', headers: { authorization: `Bearer ${admin.token}` } })
    ).json().stats.users;
    expect(after.deactivated).toBe(before.deactivated + 1);

    // And the specific user is now reported as inactive.
    const view = await app.inject({
      method: 'GET',
      url: `/api/admin/users/${victim.id}`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(view.json().user.isActive).toBe(false);
  });
});

describe('Admin user deactivation', () => {
  it('deactivated user cannot log in and their existing token is rejected', async () => {
    const admin = await makeAdmin('dadmin');
    const victim = await makeUser('victim');

    // The victim's token works before deactivation.
    const okBefore = await app.inject({ method: 'GET', url: '/api/users/me', headers: { authorization: `Bearer ${victim.token}` } });
    expect(okBefore.statusCode).toBe(200);

    const deact = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${victim.id}/deactivate`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(deact.statusCode).toBe(200);
    expect(deact.json().user.isActive).toBe(false);

    // Existing token rejected on the next request (Option A: per-request isActive check).
    const okAfter = await app.inject({ method: 'GET', url: '/api/users/me', headers: { authorization: `Bearer ${victim.token}` } });
    expect(okAfter.statusCode).toBe(401);
    expect(okAfter.json().error.code).toBe('ACCOUNT_DEACTIVATED');

    // Login is refused too.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: email('victim'), password: 'secret123' },
    });
    expect(login.statusCode).toBe(401);
  });

  it('reactivation restores login', async () => {
    const admin = await makeAdmin('radmin');
    const victim = await makeUser('revived');
    await app.inject({ method: 'PATCH', url: `/api/admin/users/${victim.id}/deactivate`, headers: { authorization: `Bearer ${admin.token}` } });
    await app.inject({ method: 'PATCH', url: `/api/admin/users/${victim.id}/activate`, headers: { authorization: `Bearer ${admin.token}` } });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: email('revived'), password: 'secret123' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('an admin cannot deactivate their own account (403)', async () => {
    const admin = await makeAdmin('selfadmin');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${admin.id}/deactivate`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ADMIN_SELF_DEACTIVATION');
  });
});

describe('Admin ride deactivation', () => {
  it('suspending a ride removes it from search; reactivating restores it', async () => {
    const admin = await makeAdmin('rideadmin');
    const driver = await makeUser('ridedriver');
    const origin = 'P10SuspOrigin';
    const destination = 'P10SuspDest';
    const ride = (await publish(driver.token, { origin, destination })).json().ride;

    const search = () => app.inject({ method: 'GET', url: `/api/rides?origin=${origin}&destination=${destination}` });

    expect((await search()).json().rides).toHaveLength(1);

    const susp = await app.inject({
      method: 'PATCH',
      url: `/api/admin/rides/${ride.id}/deactivate`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(susp.statusCode).toBe(200);
    expect(susp.json().ride.status).toBe('SUSPENDED');
    expect((await search()).json().rides).toHaveLength(0);

    const react = await app.inject({
      method: 'PATCH',
      url: `/api/admin/rides/${ride.id}/activate`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(react.statusCode).toBe(200);
    expect(react.json().ride.status).toBe('ACTIVE');
    expect((await search()).json().rides).toHaveLength(1);
  });

  it('cannot suspend a non-active ride (409)', async () => {
    const admin = await makeAdmin('rideadmin2');
    const driver = await makeUser('ridedriver2');
    const ride = (await publish(driver.token, { origin: 'P10X', destination: 'P10Y' })).json().ride;
    // Driver cancels it first.
    await app.inject({ method: 'DELETE', url: `/api/rides/${ride.id}`, headers: { authorization: `Bearer ${driver.token}` } });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/rides/${ride.id}/deactivate`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('RIDE_NOT_ACTIVE');
  });
});
