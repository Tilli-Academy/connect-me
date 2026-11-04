// Health-check route. DB-independent so the API can report liveness without a database.
export default async function healthRoutes(fastify) {
  fastify.get(
    '/api/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              uptime: { type: 'number' },
            },
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      service: 'carpool-backend',
      uptime: process.uptime(),
    }),
  );
}
