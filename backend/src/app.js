// Builds and configures the Fastify instance (no listening here — see server.js).
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';

import { env, isProduction } from './config/env.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import errorHandler from './plugins/errorHandler.js';
import healthRoutes from './modules/health/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import ridesRoutes from './modules/rides/rides.routes.js';
import bookingsRoutes from './modules/bookings/bookings.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';

export async function buildApp(options = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    // Reject unknown body fields (additionalProperties:false → 400) instead of
    // silently stripping them, so the API contract is explicit.
    ajv: { customOptions: { removeAdditional: false } },
    // Cap request bodies to limit basic payload-flooding (default is 1MB).
    bodyLimit: 512 * 1024,
  });

  // Security headers. CSP is disabled because this server returns only JSON (CSP
  // governs HTML/asset loading); the remaining headers (nosniff, frameguard, HSTS,
  // etc.) still apply.
  await app.register(helmet, { contentSecurityPolicy: false });

  // Cross-cutting plugins.
  // In development the Vite dev-server proxy makes the browser same-origin, so CORS
  // is not exercised by the app; we still allow any localhost port here so direct
  // API access during development works regardless of the Vite port. In production
  // only the explicitly configured origin is allowed.
  const corsOrigin = isProduction ? env.corsOrigin : [env.corsOrigin, /^http:\/\/localhost:\d+$/];
  await app.register(cors, { origin: corsOrigin });

  // Rate limiting is enabled by default; tests pass { rateLimit: false } so the
  // suite (many requests to one instance) isn't throttled. The global cap is a
  // baseline; auth routes set stricter per-route limits (see auth.routes.js).
  const enableRateLimit = options.rateLimit ?? true;
  if (enableRateLimit) {
    await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  }
  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(errorHandler);

  // Feature routes (users/rides/bookings added in later phases)
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(ridesRoutes);
  await app.register(bookingsRoutes);
  await app.register(adminRoutes);

  return app;
}
