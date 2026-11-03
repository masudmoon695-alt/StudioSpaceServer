import { MongoClient } from 'mongodb';
import { createApp } from '../src/createApp.js';

// Vercel serverless entrypoint. Everything is cached on globalThis so warm
// invocations reuse the same MongoDB connection and the same Express app.
const globalCache = globalThis;

async function getDb() {
  if (globalCache._mongoDb) return globalCache._mongoDb;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  if (!globalCache._mongoClient) {
    const client = new MongoClient(uri);
    await client.connect();
    globalCache._mongoClient = client;
  }

  // Never fall back to the driver default ("test"). Use the real database name.
  const dbName = process.env.MONGODB_DATABASE || process.env.DB_NAME || 'studiospacedb';
  globalCache._mongoDb = globalCache._mongoClient.db(dbName);
  return globalCache._mongoDb;
}

async function getApp() {
  if (globalCache._expressApp) return globalCache._expressApp;

  if (!globalCache._appPromise) {
    globalCache._appPromise = (async () => {
      const db = await getDb();
      const app = createApp(db);
      globalCache._expressApp = app;
      return app;
    })().catch((error) => {
      globalCache._appPromise = null; // retry on the next request
      throw error;
    });
  }

  return globalCache._appPromise;
}

export default async function handler(req, res) {
  try {
    const app = await getApp();
    return app(req, res);
  } catch (error) {
    console.error('Startup failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Server failed to start.',
      message: 'Server failed to start.',
    });
  }
}