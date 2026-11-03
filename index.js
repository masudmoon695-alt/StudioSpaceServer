import 'dotenv/config';
import { createApp } from './src/createApp.js';
import { connectToMongoDB, closeMongoDB } from './src/db.js';

const port = Number(process.env.PORT || 8000);

async function start() {
  if (!process.env.VERCEL) {
    const db = await connectToMongoDB();
    const app = createApp(db);
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
  }
}

start().catch((error) => {
  console.error('Failed to start StudioSpace API:', error);
  process.exitCode = 1;
});
