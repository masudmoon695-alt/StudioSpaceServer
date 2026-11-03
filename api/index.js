import { MongoClient } from 'mongodb';
import { createApp } from '../src/app.js';

const globalCache = globalThis;
if (!globalCache.__studioSpace) {
  globalCache.__studioSpace = { appPromise: null };
}
const cache = globalCache.__studioSpace;

async function buildApp() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.DB_NAME || undefined);
  return createApp(db);
}

export default async function handler(req, res) {
  try {
    if (!cache.appPromise) {
      cache.appPromise = buildApp().catch((error) => {
        cache.appPromise = null;
        throw error;
      });
    }
    const app = await cache.appPromise;
    return app(req, res);
  } catch (error) {
    console.error('Startup failed:', error);
    res.status(500).json({ success: false, message: 'Server failed to start.' });
  }
}