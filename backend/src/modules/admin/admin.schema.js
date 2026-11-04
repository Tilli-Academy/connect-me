// JSON Schemas for admin routes. Shape/bounds are enforced here; authorization
// (role = ADMIN) is enforced by the authorizeAdmin preHandler, not by schema.

// Shared pagination for list endpoints. Defaults are applied by ajv (useDefaults),
// and the service also defaults as a safety net.
export const paginationQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      offset: { type: 'integer', minimum: 0, default: 0 },
    },
  },
};

export const adminIdParamsSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1 } },
  },
};
