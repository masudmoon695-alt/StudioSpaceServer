import { createApp } from '../src/app.js';
import { getDb } from '../src/db.js';

let appPromise;

export default async function handler(req, res) {
  if (!appPromise) {
    appPromise = getDb().then((db) => createApp(db));
  }
  const app = await appPromise;
  return app(req, res);
}