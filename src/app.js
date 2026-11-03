import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { createAuthRouter } from './routes/auth.js';
import { createBookingsRouter } from './routes/bookings.js';
import { createUploadsRouter } from './routes/uploads.js';
import { createStudiosRouter, createMyStudiosRouter } from './routes/studios.js';
import { createReviewsRouter } from './routes/reviews.js';

export function createApp(db) {
  const app = express();

  app.disable('x-powered-by');
  if (config.isProduction) app.set('trust proxy', 1);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new HttpError(403, 'This origin is not allowed by CORS'));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)
      && !req.is('multipart/form-data')
      && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
      return next(new HttpError(400, 'Request body must be a JSON object'));
    }
    return next();
  });

  app.get('/', (_req, res) => res.json({ name: 'StudioSpace API', status: 'ok' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/studios', createStudiosRouter(db));
  app.use('/api/my-studios', createMyStudiosRouter(db));
  app.use('/api/bookings', createBookingsRouter(db));
  app.use('/api/reviews', createReviewsRouter(db));
  app.use('/api/uploads/images', createUploadsRouter());

  app.use((_req, _res, next) => next(new HttpError(404, 'Route not found')));

  // Every error response carries both "error" and "message" so the client
  // can read either field.
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      const message = 'Request body contains invalid JSON';
      return res.status(400).json({ error: message, message });
    }

    const status = Number.isInteger(error.status) ? error.status : 500;

    if (status >= 500) {
      // Full error in development so crashes can be debugged, name only in production.
      console.error('Unhandled API error:', config.isProduction ? error.name || 'Error' : error);
    }

    const message = status >= 500 ? 'Internal server error' : error.message;
    return res.status(status).json({ error: message, message });
  });

  return app;
}