// Profile business logic. Uses a Prisma `select` so passwordHash can never be
// returned, and operates only on the authenticated user's own id (set by the route).
import { NotFound } from '../../lib/errors.js';

export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  bio: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
};

export async function getProfile(prisma, id) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  if (!user) throw NotFound('User not found', 'USER_NOT_FOUND');
  return user;
}

export async function updateProfile(prisma, id, data) {
  // Ensure the account still exists so we return a clean 404 rather than a Prisma error.
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw NotFound('User not found', 'USER_NOT_FOUND');

  return prisma.user.update({ where: { id }, data, select: publicUserSelect });
}
