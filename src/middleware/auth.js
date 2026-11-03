import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.js';
import { HttpError } from '../errors.js';

export const AUTH_COOKIE = 'studio_space_token';

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: config.isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function issueAuthCookie(res, user) {
  const token = jwt.sign(
    { email: user.email, name: user.name, role: user.role || 'creator' },
    config.jwtSecret,
    { subject: user._id.toString(), expiresIn: '7d' },
  );
  res.cookie(AUTH_COOKIE, token, authCookieOptions());
}

export function requireAuth(req, _res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    return next(new HttpError(401, 'Authentication required'));
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
    return next();
  } catch {
    return next(new HttpError(401, 'Authentication token is invalid or expired'));
  }
}

const JWKS = createRemoteJWKSet(new URL(process.env.JWKS_URL));

export async function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);

    const email = payload.email;
    const name = payload.name;

    if (!email) {
      return res.status(401).json({ success: false, message: 'Please log in to continue.' });
    }

    req.user = { email, name: name || '' };
    return next();
  } catch (error) {
    if (error && error.code === 'ERR_JWT_EXPIRED') {
      return res.status(401).json({ success: false, message: 'Your session has expired.' });
    }
    return res.status(401).json({ success: false, message: 'Please log in to continue.' });
  }
}

export function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found.' });
}

export function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ success: false, message: 'Invalid JSON body.' });
  }
  console.error('API error:', err?.name, err?.code, err?.codeName, err?.message, JSON.stringify(err?.errInfo ?? null));
  return res.status(500).json({ success: false, message: 'Something went wrong on the server.' });
}
