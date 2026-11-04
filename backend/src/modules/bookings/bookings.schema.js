// JSON Schemas for booking routes.

export const createBookingSchema = {
  body: {
    type: 'object',
    required: ['rideId', 'seatsBooked'],
    additionalProperties: false,
    properties: {
      rideId: { type: 'string', minLength: 1 },
      seatsBooked: { type: 'integer', minimum: 1, maximum: 8 },
    },
  },
};

export const bookingIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1 } },
  },
};

export const rideBookingsSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1 } },
  },
};
