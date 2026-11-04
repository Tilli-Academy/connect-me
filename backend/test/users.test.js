// Phase 3 profile tests: GET/PATCH /api/users/me, auth guarding, validation, and
// that email/password cannot be changed via this endpoint.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app;
const TEST_DOMAIN = 'phase3.test';
const email = (n) => `user_${n}@${TEST_DOMAIN}`;

async function cleanup() {
  await app.prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_DOMAIN}` } } });
}

async function registerAndToken(n) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: email(n), password: 'secret123', name: `User ${n}` },
  });
  return res.json().token;
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

describe('GET /api/users/me', () => {
  it('returns the authenticated profile (no passwordHash)', async () => {
    const token = await registerAndToken('get');
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(email('get'));
    expect(res.json().user).not.toHaveProperty('passwordHash');
  });

  it('rejects without a token (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/users/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/users/me', () => {
  it('updates editable fields', async () => {
    const token = await registerAndToken('patch');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Renamed', phone: '+1 555 0100', bio: 'Carpooler' },
    });
    expect(res.statusCode).toBe(200);
    const { user } = res.json();
    expect(user.name).toBe('Renamed');
    expect(user.phone).toBe('+1 555 0100');
    expect(user.bio).toBe('Carpooler');
  });

  it('can clear a nullable field with null', async () => {
    const token = await registerAndToken('clear');
    await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: '12345' },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { phone: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.phone).toBeNull();
  });

  it('rejects an empty update (400)', async () => {
    const token = await registerAndToken('empty');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects attempts to change email or password (400)', async () => {
    const token = await registerAndToken('immutable');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${token}` },
      payload: { email: 'hacker@evil.test', passwordHash: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects without a token (401)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      payload: { name: 'Nope' },
    });
    expect(res.statusCode).toBe(401);
  });
});
