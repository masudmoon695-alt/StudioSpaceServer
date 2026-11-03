import { MongoClient } from 'mongodb';
import { config } from './config.js';

const client = new MongoClient(config.mongodbUri);

export async function connectToMongoDB() {
  await client.connect();
  console.log('Connected to MongoDB');
 return client.db();
}

export async function closeMongoDB() {
  await client.close();
}
