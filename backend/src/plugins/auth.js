// Auth plugin: registers @fastify/jwt and exposes `authenticate`, `optionalAuthenticate`,
// and `authorizeAdmin` preHandlers. Tokens carry { id, email, role }; verification
// attaches the payload to request.user.
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

import { env } from '../config/env.js';
import { Unauthorized, Forbidden } from '../lib/errors.js';

async function authPlugin(fastify) {
  await fastify.register(jwt, {
    secret: env.jwtSecret,
    sign: { expiresIn: env.jwtExpiresIn }, // configurable; defaults to 7d. Refresh tokens deferred.
  });

  // preHandler for protected routes. Throws a 401 (handled centrally) when the
  // token is missing or invalid; otherwise populates request.user from the payload.
  // After verifying the token we load the account (one indexed PK lookup) so a
  // deactivated user is rejected on their very next request — not only at login —
  // and so request.user.role always reflects the current DB value (Phase 10).
  fastify.decorate('authenticate', async function authenticate(request) {
    await request.jwtVerify();
    const account = await fastify.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { isActive: true, role: true },
    });
    if (!account || !account.isActive) {
      throw Unauthorized('Account is deactivated', 'ACCOUNT_DEACTIVATED');
    }
    request.user.role = account.role;
  });

  // preHandler for admin-only routes; runs after `authenticate` so request.user.role
  // is populated. Rejects non-admins with 403 (handled centrally).
  fastify.decorate('authorizeAdmin', async function authorizeAdmin(request) {
    if (request.user?.role !== 'ADMIN') {
      throw Forbidden('Admin privileges required', 'ADMIN_ONLY');
    }
  });

  // preHandler for public routes that behave differently when a user is known
  // (e.g. search excludes the caller's own rides). Never rejects: a missing or
  // invalid token simply leaves request.user undefined (anonymous).
  fastify.decorate('optionalAuthenticate', async function optionalAuthenticate(request) {
    try {
      await request.jwtVerify();
    } catch {
      request.user = undefined;
    }
  });
}

export default fp(authPlugin, { name: 'auth' });
