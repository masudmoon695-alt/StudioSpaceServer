import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import { ObjectId } from 'mongodb';

let server;
let baseUrl;
let bearerToken;
let jwksServer;
let createApp;

before(async () => {
  jwksServer = createServer((req, res) => {
    if (req.url?.includes('/jwks')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  await new Promise((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'studio-space-test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  bearerToken = await new SignJWT({ email: 'guest@example.com', name: 'Guest Reviewer', role: 'creator' })
    .setProtectedHeader({ alg: 'RS256', kid: 'studio-space-test-key', use: 'sig' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  process.env.JWKS_URL = `http://127.0.0.1:${jwksServer.address().port}/jwks`;
  ({ createApp } = await import('../src/app.js'));
  const db = { collection: () => ({}) };
  server = createServer(createApp(db));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await new Promise((resolve, reject) => jwksServer.close((error) => error ? reject(error) : resolve()));
});

test('health endpoint responds with API status', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('credentialed CORS accepts configured client origins', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { origin: 'http://localhost:3000' },
  });
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

test('CORS rejects origins outside the allowlist', async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { origin: 'https://untrusted.example' },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'This origin is not allowed by CORS',
    message: 'This origin is not allowed by CORS',
  });
});

test('malformed and missing request bodies return a client error', async () => {
  const malformed = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);

  const missing = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST' });
  assert.equal(missing.status, 400);
});

test('studio, booking, and image mutations require authentication', async () => {
  const requests = [
    fetch(`${baseUrl}/api/studios`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    fetch(`${baseUrl}/api/bookings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    fetch(`${baseUrl}/api/reviews`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    fetch(`${baseUrl}/api/uploads/images`, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data' },
    }),
  ];
  const responses = await Promise.all(requests);
  assert.deepEqual(responses.map((response) => response.status), [401, 401, 401, 401]);
});

function createReviewApi({ studioExists = true } = {}) {
  const studioId = new ObjectId().toString();
  const userId = new ObjectId().toString();
  const savedReviews = [];
  const updatedStudio = { rating: 0, reviewCount: 0 };
  const collections = {
    reviews: {
      findOne: async (filter) => savedReviews.find((review) =>
        review.studioId === filter.studioId && review.userId === filter.userId) || null,
      insertOne: async (review) => {
        const insertedId = new ObjectId();
        savedReviews.push({ ...review, _id: insertedId });
        return { insertedId };
      },
      aggregate: (pipeline) => {
        const studioFilter = pipeline.find((stage) => stage.$match)?.$match.studioId;
        const matching = savedReviews.filter((review) => review.studioId === studioFilter);
        return {
          toArray: async () => {
            if (!matching.length) return [];
            const average = matching.reduce((total, review) => total + review.rating, 0) / matching.length;
            return [{ _id: null, average, count: matching.length }];
          },
        };
      },
    },
    studios: {
      findOne: async ({ _id }) => studioExists && _id.toString() === studioId ? { _id } : null,
      updateOne: async (_filter, update) => {
        updatedStudio.rating = update.$set.rating;
        updatedStudio.reviewCount = update.$set.reviewCount;
        return { matchedCount: 1 };
      },
    },
  };
  const db = { collection: (name) => collections[name] || {} };
  const server = createServer(createApp(db));
  const token = bearerToken;
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((done, reject) => server.close((error) => error ? reject(error) : done())),
      savedReviews,
      updatedStudio,
      studioId,
      userId,
      token,
    }));
  });
}

test('review submission validates the payload and requires an existing studio', async () => {
  const api = await createReviewApi({ studioExists: false });
  try {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` };
    const invalidRating = await fetch(`${api.baseUrl}/api/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ studioId: api.studioId, rating: 6, comment: 'Great space' }),
    });
    assert.equal(invalidRating.status, 400);

    const shortComment = await fetch(`${api.baseUrl}/api/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ studioId: api.studioId, rating: 5, comment: 'Nice' }),
    });
    assert.equal(shortComment.status, 400);

    const extraIdentity = await fetch(`${api.baseUrl}/api/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        studioId: api.studioId,
        rating: 5,
        comment: 'Great space',
        name: 'Impersonated Reviewer',
      }),
    });
    assert.equal(extraIdentity.status, 400);

    const missingStudio = await fetch(`${api.baseUrl}/api/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ studioId: api.studioId, rating: 5, comment: 'Great space' }),
    });
    assert.equal(missingStudio.status, 404);
    assert.equal(api.savedReviews.length, 0);
  } finally {
    await api.close();
  }
});

test('authenticated review submissions persist reviewer identity from the session', async () => {
  const api = await createReviewApi();
  try {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${bearerToken}` };
    const response = await fetch(`${api.baseUrl}/api/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ studioId: api.studioId, rating: 5, comment: '  A lovely space.  ' }),
    });
    const result = await response.json();

    assert.equal(response.status, 201);
    assert.equal(result.review._id, api.savedReviews[0]._id.toString());
    assert.equal(result.review.userName, 'Guest Reviewer');
    assert.equal(result.review.rating, 5);
    assert.equal(result.review.comment, 'A lovely space.');
    assert.equal(result.review.studioId, api.studioId);
    assert.equal(result.review.userId, 'guest@example.com');
    assert.equal(typeof result.review.createdAt, 'string');
    assert.equal(api.savedReviews.length, 1);
    assert.equal(api.savedReviews[0].userName, 'Guest Reviewer');
    assert.equal(api.updatedStudio.rating, 5);
    assert.equal(api.updatedStudio.reviewCount, 1);

    const duplicate = await fetch(`${api.baseUrl}/api/reviews`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ studioId: api.studioId, rating: 4, comment: 'Another review' }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(api.savedReviews.length, 1);
  } finally {
    await api.close();
  }
});
