// Prisma plugin: instantiates a single PrismaClient, decorates the Fastify
// instance as `fastify.prisma`, and disconnects on shutdown.
// Connection is lazy (Prisma connects on first query), so the app can boot and
// serve the DB-independent health check without a live database.
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

async function prismaPlugin(fastify) {
  const prisma = new PrismaClient();

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });
}

export default fp(prismaPlugin, { name: 'prisma' });
