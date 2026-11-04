// Phase 0 smoke test: the health endpoint responds without a database.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { buildApp } from '../src/app.js';

let app;

beforeAll(async () => {
  app = await buildApp({ logger: false, rateLimit: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('carpool-backend');
    expect(typeof body.uptime).toBe('number');
  });
});
