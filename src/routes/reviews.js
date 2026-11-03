import { Router } from 'express';
import { MongoServerError, ObjectId } from 'mongodb';
import { HttpError } from '../errors.js';
import { verifyJWT } from '../middleware/auth.js';

export function createReviewsRouter(db) {
  const router = Router();
  const reviews = db.collection('reviews');
  const studios = db.collection('studios');

  router.post('/', verifyJWT, async (req, res, next) => {
    try {
      const bodyFields = Object.keys(req.body);
      if (bodyFields.length !== 3
        || !bodyFields.includes('studioId')
        || !bodyFields.includes('rating')
        || !bodyFields.includes('comment')) {
        throw new HttpError(400, 'Provide only studioId, rating, and comment');
      }

      const { studioId, rating } = req.body;
      if (typeof studioId !== 'string' || !ObjectId.isValid(studioId)) {
        throw new HttpError(400, 'A valid studioId is required');
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new HttpError(400, 'Rating must be a whole number from 1 to 5');
      }
      if (typeof req.body.comment !== 'string') {
        throw new HttpError(400, 'Comment must be between 5 and 1000 characters');
      }
      const comment = req.body.comment.trim();
      if (comment.length < 5 || comment.length > 1000) {
        throw new HttpError(400, 'Comment must be between 5 and 1000 characters');
      }

      const _id = new ObjectId(studioId);
      const studio = await studios.findOne({ _id });
      if (!studio) throw new HttpError(404, 'Studio not found');

      const existing = await reviews.findOne({ studioId, userEmail: req.user.email });
      if (existing) throw new HttpError(409, 'You have already reviewed this studio');

      const review = {
        studioId,
        userEmail: req.user.email,
        userName: req.user.name,
        rating,
        comment,
        createdAt: new Date(),
      };
      const { insertedId } = await reviews.insertOne(review);

      // Update the studio's rating/reviewCount in an isolated try/catch so a
      // failure there can never turn a successfully saved review into a 500.
      try {
        const [stats] = await reviews.aggregate([
          { $match: { studioId } },
          { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
        ]).toArray();
        const reviewCount = stats?.count ?? 0;
        const averageRating = stats ? Math.round(stats.average * 10) / 10 : 0;
        await studios.updateOne(
          { _id },
          { $set: { rating: averageRating, reviewCount, updatedAt: new Date() } },
        );
      } catch (updateError) {
        console.error('Failed to update studio rating/reviewCount after saving review:', updateError);
      }

      res.status(201).json({
        review: { ...review, _id: insertedId.toString() },
      });
    } catch (error) {
      if (error instanceof MongoServerError) {
        if (error.code === 11000) {
          return next(new HttpError(409, 'You have already reviewed this studio'));
        }
        if (error.code === 121) {
          return next(new HttpError(400, 'Review could not be saved: it does not satisfy the review schema.'));
        }
      }
      next(error);
    }
  });

  // GET /api/reviews?studioId=<studio _id as string>
  router.get('/', async (req, res, next) => {
    try {
      const { studioId } = req.query;

      if (typeof studioId !== 'string' || !ObjectId.isValid(studioId)) {
        throw new HttpError(400, 'A valid studioId is required');
      }

      const list = await reviews
        .find({ studioId })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();

      res.json({ reviews: list });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/reviews/:id  (single review by its own _id)
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        throw new HttpError(400, 'A valid review id is required');
      }

      const review = await reviews.findOne({ _id: new ObjectId(id) });

      if (!review) {
        throw new HttpError(404, 'Review not found');
      }

      res.json({ review });
    } catch (error) {
      next(error);
    }
  });

  return router;
}