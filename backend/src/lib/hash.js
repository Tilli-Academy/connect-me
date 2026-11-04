// Password hashing helpers (bcrypt). Plaintext passwords never leave this module.
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
