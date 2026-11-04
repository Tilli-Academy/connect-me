// Auth business logic. Owns password hashing/verification and user lookups.
// Never returns passwordHash; callers receive the public user shape only.
import { hashPassword, verifyPassword } from '../../lib/hash.js';
import { Conflict, Unauthorized, NotFound } from '../../lib/errors.js';

export function toPublicUser(user) {
  const { passwordHash, ...publicFields } = user;
  return publicFields;
}

export async function registerUser(prisma, { email, password, name, phone }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw Conflict('Email already registered', 'EMAIL_TAKEN');

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name, phone: phone ?? null },
  });
  return toPublicUser(user);
}

export async function loginUser(prisma, { email, password }) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Same message whether the email is unknown or the password is wrong (no user enumeration).
  if (!user) throw Unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw Unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  // A deactivated account (Phase 10) cannot obtain a token, even with valid credentials.
  if (!user.isActive) throw Unauthorized('Account is deactivated', 'ACCOUNT_DEACTIVATED');

  return toPublicUser(user);
}

export async function getUserById(prisma, id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw NotFound('User not found', 'USER_NOT_FOUND');
  return toPublicUser(user);
}

export async function changePassword(prisma, id, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw NotFound('User not found', 'USER_NOT_FOUND');

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw Unauthorized('Current password is incorrect', 'INVALID_CREDENTIALS');

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
}
