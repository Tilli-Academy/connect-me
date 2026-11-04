// Admin routes (Phase 10). Every route runs authenticate → authorizeAdmin, so only
// an active ADMIN account reaches the service. Routes stay thin; logic is in the service.
import { paginationQuerySchema, adminIdParamsSchema } from './admin.schema.js';
import * as adminService from './admin.service.js';

export default async function adminRoutes(fastify) {
  const adminOnly = { preHandler: [fastify.authenticate, fastify.authorizeAdmin] };

  // Dashboard statistics.
  fastify.get('/api/admin/stats', adminOnly, async () => {
    return { stats: await adminService.getStats(fastify.prisma) };
  });

  // Users: list, view, deactivate, reactivate.
  fastify.get('/api/admin/users', { ...adminOnly, schema: paginationQuerySchema }, async (request) => {
    return adminService.listUsers(fastify.prisma, request.query);
  });

  fastify.get('/api/admin/users/:id', { ...adminOnly, schema: adminIdParamsSchema }, async (request) => {
    return { user: await adminService.getUser(fastify.prisma, request.params.id) };
  });

  fastify.patch('/api/admin/users/:id/deactivate', { ...adminOnly, schema: adminIdParamsSchema }, async (request) => {
    return { user: await adminService.setUserActive(fastify.prisma, request.user.id, request.params.id, false) };
  });

  fastify.patch('/api/admin/users/:id/activate', { ...adminOnly, schema: adminIdParamsSchema }, async (request) => {
    return { user: await adminService.setUserActive(fastify.prisma, request.user.id, request.params.id, true) };
  });

  // Rides: list (any status), view, deactivate (SUSPENDED), reactivate (ACTIVE).
  fastify.get('/api/admin/rides', { ...adminOnly, schema: paginationQuerySchema }, async (request) => {
    return adminService.listRides(fastify.prisma, request.query);
  });

  fastify.get('/api/admin/rides/:id', { ...adminOnly, schema: adminIdParamsSchema }, async (request) => {
    return { ride: await adminService.getRide(fastify.prisma, request.params.id) };
  });

  fastify.patch('/api/admin/rides/:id/deactivate', { ...adminOnly, schema: adminIdParamsSchema }, async (request) => {
    return { ride: await adminService.setRideActive(fastify.prisma, request.params.id, false) };
  });

  fastify.patch('/api/admin/rides/:id/activate', { ...adminOnly, schema: adminIdParamsSchema }, async (request) => {
    return { ride: await adminService.setRideActive(fastify.prisma, request.params.id, true) };
  });
}
