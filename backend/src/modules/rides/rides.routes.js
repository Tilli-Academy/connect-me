// Ride routes. Static '/mine/offered' is declared before '/:id' so it is not
// shadowed by the parametric route. Mutations require auth + ownership (in service).
import { createRideSchema, updateRideSchema, rideIdSchema, searchRidesSchema } from './rides.schema.js';
import * as ridesService from './rides.service.js';

export default async function ridesRoutes(fastify) {
  // Publish a ride (caller is the driver).
  fastify.post('/api/rides', { schema: createRideSchema, preHandler: [fastify.authenticate] }, async (request, reply) => {
    const ride = await ridesService.createRide(fastify.prisma, request.user.id, request.body);
    reply.code(201).send({ ride });
  });

  // Search bookable rides. Public; excludes the caller's own rides when authenticated.
  fastify.get('/api/rides', { schema: searchRidesSchema, preHandler: [fastify.optionalAuthenticate] }, async (request) => {
    const rides = await ridesService.searchRides(fastify.prisma, request.query, request.user?.id);
    return { rides };
  });

  // The caller's own offered rides.
  fastify.get('/api/rides/mine/offered', { preHandler: [fastify.authenticate] }, async (request) => {
    const rides = await ridesService.getOwnedRides(fastify.prisma, request.user.id);
    return { rides };
  });

  // Public ride details.
  fastify.get('/api/rides/:id', { schema: rideIdSchema }, async (request) => {
    const ride = await ridesService.getRideById(fastify.prisma, request.params.id);
    return { ride };
  });

  // Edit a ride (owner only).
  fastify.patch(
    '/api/rides/:id',
    { schema: { ...rideIdSchema, ...updateRideSchema }, preHandler: [fastify.authenticate] },
    async (request) => {
      const ride = await ridesService.updateRide(fastify.prisma, request.user.id, request.params.id, request.body);
      return { ride };
    },
  );

  // Cancel a ride (owner only); cascades outstanding bookings.
  fastify.delete(
    '/api/rides/:id',
    { schema: rideIdSchema, preHandler: [fastify.authenticate] },
    async (request) => {
      const ride = await ridesService.cancelRide(fastify.prisma, request.user.id, request.params.id);
      return { ride };
    },
  );
}
