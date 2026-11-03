import 'dotenv/config';
import express from 'express';
import { createApp } from './src/createApp.js';
import { connectToMongoDB, closeMongoDB } from './src/db.js';

const port = Number(process.env.PORT || 8000);

// Vercel looks for an entrypoint that imports express and default-exports an app.
// This thin app connects to MongoDB once (reused on warm starts) and hands every
// request to the real app built by createApp(db).
const app = express();

let readyApp;
function getReadyApp() {
  if (!readyApp) {
    readyApp = connectToMongoDB()
      .then((db) => createApp(db))
      .catch((error) => {
        readyApp = undefined; // try again on the next request
        throw error;
      });
  }
  return readyApp;
}

app.use(async (req, res, next) => {
  try {
    const api = await getReadyApp();
    return api(req, res, next);
  } catch (error) {
    console.error('Failed to start StudioSpace API:', error);
    return res.status(500).json({
      error: 'Service unavailable',
      message: 'Service unavailable',
    });
  }
});

// Local development only. On Vercel the platform handles the HTTP server.
if (!process.env.VERCEL) {
  getReadyApp()
    .then(() => {
      const server = app.listen(port, () => {
        console.log(`StudioSpace API listening on port ${port}`);
      });

      const shutdown = () => {
        server.close(async () => {
          await closeMongoDB();
          process.exit(0);
        });
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((error) => {
      console.error('Failed to start StudioSpace API:', error);
      process.exitCode = 1;
    });
}

export default app;