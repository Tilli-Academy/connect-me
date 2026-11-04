// JSON Schemas for ride routes. Business rules that need DB state (future date,
// seats-vs-bookings) are enforced in the service; shape/bounds are enforced here.

const origin = { type: 'string', minLength: 1, maxLength: 120 };
const destination = { type: 'string', minLength: 1, maxLength: 120 };
const departureAt = { type: 'string', format: 'date-time' };
const totalSeats = { type: 'integer', minimum: 1, maximum: 8 };
const pricePerSeat = { type: 'number', minimum: 0, maximum: 100000 };
const notes = { type: ['string', 'null'], maxLength: 500 };

export const createRideSchema = {
  body: {
    type: 'object',
    required: ['origin', 'destination', 'departureAt', 'totalSeats', 'pricePerSeat'],
    additionalProperties: false,
    properties: { origin, destination, departureAt, totalSeats, pricePerSeat, notes },
  },
};

export const updateRideSchema = {
  body: {
    type: 'object',
    minProperties: 1,
    additionalProperties: false,
    properties: { origin, destination, departureAt, totalSeats, pricePerSeat, notes },
  },
};

export const rideIdSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1 } },
  },
};

export const searchRidesSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      origin: { type: 'string', minLength: 1, maxLength: 120 },
      destination: { type: 'string', minLength: 1, maxLength: 120 },
      date: { type: 'string', format: 'date' }, // YYYY-MM-DD (interpreted as a UTC day)
    },
  },
};
