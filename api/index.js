import { MongoClient } from 'mongodb';
import { createApp } from '../src/createApp.js';

const globalCache = globalThis;

async function getDb() {
  if (globalCache._mongoDb) {
    return globalCache._mongoDb;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  if (!globalCache._mongoClient) {
    const client = new MongoClient(uri);
    await client.connect();
    globalCache._mongoClient = client;
  }

  const db = globalCache._mongoClient.db(process.env.DB_NAME || undefined);
  globalCache._mongoDb = db;
  return db;
}

async function getApp() {
  if (globalCache._expressApp) {
    return globalCache._expressApp;
  }

  if (!globalCache._appPromise) {
    globalCache._appPromise = (async () => {
      const db = await getDb();
      const app = createApp(db);
      globalCache._expressApp = app;
      return app;
    })().catch((error) => {
      globalCache._appPromise = null;
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
    res.status(500).json({ success: false, message: 'Server failed to start.' });
  }
}
