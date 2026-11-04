// Loads and validates environment variables. Fails fast if a required var is missing.
// Only Phase 0 vars are required here; DATABASE_URL and JWT_SECRET are added in later phases.
import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(required('PORT', '3000')),
  host: required('HOST', '0.0.0.0'),
  corsOrigin: required('CORS_ORIGIN', 'http://localhost:5173'),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d', // MVP default; refresh tokens deferred
};

export const isProduction = env.nodeEnv === 'production';
