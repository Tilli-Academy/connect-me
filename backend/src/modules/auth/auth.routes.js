// Auth routes. Thin: validate (schema) → authenticate where needed → delegate to service.
import { registerSchema, loginSchema, changePasswordSchema } from './auth.schema.js';
import * as authService from './auth.service.js';

export default async function authRoutes(fastify) {
  // Stricter limits on the credential endpoints (brute-force defense). These are
  // honored when the rate-limit plugin is registered; ignored otherwise (e.g. tests).
  const registerLimit = { rateLimit: { max: 5, timeWindow: '1 minute' } };
  const loginLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  // Register a new account.
  fastify.post('/api/auth/register', { schema: registerSchema, config: registerLimit }, async (request, reply) => {
    const user = await authService.registerUser(fastify.prisma, request.body);
    const token = await reply.jwtSign({ id: user.id, email: user.email, role: user.role });
    reply.code(201).send({ token, user });
  });

  // Log in with email + password.
  fastify.post('/api/auth/login', { schema: loginSchema, config: loginLimit }, async (request, reply) => {
    const user = await authService.loginUser(fastify.prisma, request.body);
    const token = await reply.jwtSign({ id: user.id, email: user.email, role: user.role });
    return { token, user };
  });

  // Current authenticated user.
  fastify.get('/api/auth/me', { preHandler: [fastify.authenticate] }, async (request) => {
    const user = await authService.getUserById(fastify.prisma, request.user.id);
    return { user };
  });

  // Change own password.
  fastify.post(
    '/api/auth/change-password',
    { schema: changePasswordSchema, preHandler: [fastify.authenticate] },
    async (request, reply) => {
      await authService.changePassword(fastify.prisma, request.user.id, request.body);
      reply.code(204).send();
    },
  );
}
