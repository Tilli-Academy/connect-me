// Booking routes. All protected. Ownership (ride owner for accept/reject/requests,
// passenger for own bookings) is enforced in the service from request.user.id.
import { createBookingSchema, bookingIdSchema, rideBookingsSchema } from './bookings.schema.js';
import * as bookingsService from './bookings.service.js';

export default async function bookingsRoutes(fastify) {
  // Passenger requests seats on a ride.
  fastify.post('/api/bookings', { schema: createBookingSchema, preHandler: [fastify.authenticate] }, async (request, reply) => {
    const booking = await bookingsService.requestBooking(fastify.prisma, request.user.id, request.body);
    reply.code(201).send({ booking });
  });

  // The caller's own bookings.
  fastify.get('/api/bookings/mine', { preHandler: [fastify.authenticate] }, async (request) => {
    const bookings = await bookingsService.getMyBookings(fastify.prisma, request.user.id);
    return { bookings };
  });

  // Driver accepts a request (decrements seats, transactional).
  fastify.patch('/api/bookings/:id/accept', { schema: bookingIdSchema, preHandler: [fastify.authenticate] }, async (request) => {
    const booking = await bookingsService.acceptBooking(fastify.prisma, request.user.id, request.params.id);
    return { booking };
  });

  // Driver rejects a request.
  fastify.patch('/api/bookings/:id/reject', { schema: bookingIdSchema, preHandler: [fastify.authenticate] }, async (request) => {
    const booking = await bookingsService.rejectBooking(fastify.prisma, request.user.id, request.params.id);
    return { booking };
  });

  // Passenger cancels their own booking (restores seats if it was accepted).
  fastify.patch('/api/bookings/:id/cancel', { schema: bookingIdSchema, preHandler: [fastify.authenticate] }, async (request) => {
    const booking = await bookingsService.cancelBooking(fastify.prisma, request.user.id, request.params.id);
    return { booking };
  });

  // Incoming requests for a ride (owner only). Path lives under /rides but the
  // logic is a booking concern, so it is served from the bookings module.
  fastify.get('/api/rides/:id/bookings', { schema: rideBookingsSchema, preHandler: [fastify.authenticate] }, async (request) => {
    const bookings = await bookingsService.getRideBookings(fastify.prisma, request.user.id, request.params.id);
    return { bookings };
  });
}
