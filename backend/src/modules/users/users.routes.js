// Users (profile) routes. Protected: the acting user is always request.user.id,
// so a user can only read/update their own profile (no id in the path → no IDOR).
import { updateProfileSchema } from './users.schema.js';
import * as usersService from './users.service.js';

export default async function usersRoutes(fastify) {
  fastify.get('/api/users/me', { preHandler: [fastify.authenticate] }, async (request) => {
    const user = await usersService.getProfile(fastify.prisma, request.user.id);
    return { user };
  });

  fastify.patch(
    '/api/users/me',
    { schema: updateProfileSchema, preHandler: [fastify.authenticate] },
    async (request) => {
      const user = await usersService.updateProfile(fastify.prisma, request.user.id, request.body);
      return { user };
    },
  );
}
