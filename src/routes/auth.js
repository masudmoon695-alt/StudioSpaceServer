import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { AUTH_COOKIE, authCookieOptions, issueAuthCookie, requireAuth } from '../middleware/auth.js';
import { isValidEmail, isValidPassword } from '../validation.js';

const OAUTH_STATE_COOKIE = 'studio_space_oauth_state';

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    photoURL: user.photoURL || '',
    role: user.role || 'creator',
  };
}

function stateCookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/api/auth/google/callback',
    maxAge: 10 * 60 * 1000,
  };
}

function googleCallbackUrl() {
  return process.env.GOOGLE_CALLBACK_URL
    || `${config.apiUrl.replace(/\/+$/, '')}/api/auth/google/callback`;
}

export function createAuthRouter(db) {
  const router = Router();
  const users = db.collection('users');

  router.post('/register', async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password;
    const photoURL = typeof req.body.photoURL === 'string' ? req.body.photoURL.trim() : '';

    if (!name || name.length > 100) throw new HttpError(400, 'Name is required and must be under 100 characters');
    if (!isValidEmail(email)) throw new HttpError(400, 'Enter a valid email address');
    if (!isValidPassword(password)) {
      throw new HttpError(400, 'Password must be at least 6 characters and include uppercase and lowercase letters');
    }

    const existing = await users.findOne({ email }, { projection: { _id: 1 } });
    if (existing) throw new HttpError(409, 'An account with this email already exists');

    const user = {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      photoURL,
      role: 'creator',
      authProvider: 'password',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { insertedId } = await users.insertOne(user);
    user._id = insertedId;

    res.status(201).json({ message: 'Account created', user: publicUser(user) });
  });

  router.post('/login', async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password;
    if (!isValidEmail(email) || typeof password !== 'string') {
      throw new HttpError(400, 'A valid email and password are required');
    }

    const user = await users.findOne({ email });
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, 'Email or password is incorrect');
    }

    issueAuthCookie(res, user);
    res.json({ message: 'Signed in', user: publicUser(user) });
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(AUTH_COOKIE, authCookieOptions());
    res.json({ message: 'Signed out' });
  });

  router.get('/me', requireAuth, async (req, res) => {
    if (!ObjectId.isValid(req.user.id)) throw new HttpError(401, 'Authentication token is invalid');
    const user = await users.findOne(
      { _id: new ObjectId(req.user.id) },
      { projection: { passwordHash: 0 } },
    );
    if (!user) throw new HttpError(401, 'User account no longer exists');
    res.json({ user: publicUser(user) });
  });

  router.get('/google', (_req, res) => {
    if (!config.googleClientId || !config.googleClientSecret) {
      throw new HttpError(503, 'Google sign-in is not configured');
    }
    const state = randomBytes(32).toString('hex');
    res.cookie(OAUTH_STATE_COOKIE, state, stateCookieOptions());
    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: googleCallbackUrl(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  router.get('/google/callback', async (req, res) => {
    const state = req.cookies?.[OAUTH_STATE_COOKIE];
    const returnedState = req.query.state;
    res.clearCookie(OAUTH_STATE_COOKIE, stateCookieOptions());
    if (typeof state !== 'string' || typeof returnedState !== 'string'
      || state.length !== returnedState.length
      || !timingSafeEqual(Buffer.from(state), Buffer.from(returnedState))) {
      throw new HttpError(400, 'Google sign-in state is invalid or expired');
    }
    if (typeof req.query.error === 'string') throw new HttpError(401, 'Google sign-in was not completed');
    if (typeof req.query.code !== 'string') throw new HttpError(400, 'Google did not return an authorization code');
    if (!config.googleClientId || !config.googleClientSecret) {
      throw new HttpError(503, 'Google sign-in is not configured');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: googleCallbackUrl(),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenResponse.ok) throw new HttpError(502, 'Google sign-in could not be completed');
    const tokenData = await tokenResponse.json();
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!profileResponse.ok) throw new HttpError(502, 'Google profile could not be loaded');
    const profile = await profileResponse.json();
    const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '';
    if (!isValidEmail(email) || profile.verified_email !== true) {
      throw new HttpError(401, 'A verified Google email is required');
    }

    let user = await users.findOne({ email });
    if (!user) {
      user = {
        name: typeof profile.name === 'string' ? profile.name : email.split('@')[0],
        email,
        photoURL: typeof profile.picture === 'string' ? profile.picture : '',
        role: 'creator',
        authProvider: 'google',
        googleId: profile.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { insertedId } = await users.insertOne(user);
      user._id = insertedId;
    } else if (!user.googleId && profile.id) {
      await users.updateOne(
        { _id: user._id },
        { $set: { googleId: profile.id, updatedAt: new Date() } },
      );
    }

    issueAuthCookie(res, user);
    res.redirect(config.clientUrl);
  });

  return router;
}
