import 'dotenv/config';

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
  } catch {
    // Report invalid CORS configuration without echoing user-provided values.
  }
  throw new Error('CORS origins must be valid HTTP or HTTPS origins');
}

const clientUrl = normalizeOrigin(
  process.env.CLIENT_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000',
);
const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 8000}`;
const configuredOrigins = [
  clientUrl,
  'http://localhost:5173',
  'http://localhost:3000',
  ...(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
];

export const config = {
  mongodbUri: required('MONGODB_URI'),
  jwtSecret: process.env.JWT_SECRET || required('BETTER_AUTH_SECRET'),
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  imgbbApiKey: process.env.IMGBB_API_KEY,
  apiUrl,
  clientUrl,
  corsOrigins: [...new Set(configuredOrigins.map(normalizeOrigin))],
  isProduction: process.env.NODE_ENV === 'production',
};
