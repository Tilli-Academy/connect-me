// Phase 2 auth tests: register, login, me, change-password, and their failure paths.
// Uses the real (dev) database; test users are namespaced and cleaned up around the run.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app;
const TEST_DOMAIN = 'phase2.test';
const email = (n) => `user_${n}@${TEST_DOMAIN}`;

async function cleanup() {
  await app.prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_DOMAIN}` } } });
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

describe('POST /api/auth/register', () => {
  it('creates a user and returns a token (no passwordHash leaked)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: email('reg'), password: 'secret123', name: 'Reg User' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.token).toBe('string');
    expect(body.user.email).toBe(email('reg'));
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email with 409', async () => {
    const payload = { email: email('dup'), password: 'secret123', name: 'Dup' };
    await app.inject({ method: 'POST', url: '/api/auth/register', payload });
    const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects invalid input with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'not-an-email', password: 'short', name: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  const creds = { email: email('login'), password: 'secret123', name: 'Login User' };

  beforeAll(async () => {
    await app.inject({ method: 'POST', url: '/api/auth/register', payload: creds });
  });

  it('succeeds with correct credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: creds.email, password: creds.password },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe('string');
  });

  it('rejects wrong password with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: creds.email, password: 'wrongpass' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects unknown email with 401 (same message, no enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: email('ghost'), password: 'whatever1' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the user with a valid token', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: email('me'), password: 'secret123', name: 'Me User' },
    });
    const { token } = reg.json();

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe(email('me'));
  });

  it('rejects a missing token with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/auth/change-password', () => {
  it('changes the password; old fails, new works', async () => {
    const creds = { email: email('chpw'), password: 'oldpass123', name: 'ChPw' };
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: creds });
    const { token } = reg.json();

    const change = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'oldpass123', newPassword: 'newpass456' },
    });
    expect(change.statusCode).toBe(204);

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: creds.email, password: 'oldpass123' },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: creds.email, password: 'newpass456' },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it('rejects wrong current password with 401', async () => {
    const creds = { email: email('chpw2'), password: 'oldpass123', name: 'ChPw2' };
    const reg = await app.inject({ method: 'POST', url: '/api/auth/register', payload: creds });
    const { token } = reg.json();

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'notmypassword', newPassword: 'newpass456' },
    });
    expect(res.statusCode).toBe(401);
  });
});
