import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { HttpError } from '../errors.js';
import { verifyJWT } from '../middleware/auth.js';
import { escapeRegex } from '../validation.js';

const STUDIO_CATEGORIES = ['Film Stage', 'Music Suite', 'Photo Studio', 'Podcast Lounge', 'Workshop'];

function validateStudio(body, partial = false) {
  const data = {};

  if ('title' in body && body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 150) {
      throw new HttpError(400, 'Title must be a non-empty string under 150 characters');
    }
    data.title = body.title.trim();
  }

  if ('category' in body && body.category !== undefined) {
    if (typeof body.category !== 'string' || !body.category.trim() || body.category.trim().length > 80) {
      throw new HttpError(400, 'Category must be one of the supported studio categories');
    }
    const trimmedCategory = body.category.trim();
    const matchedCategory = STUDIO_CATEGORIES.find(
      (c) => c.toLowerCase() === trimmedCategory.toLowerCase(),
    );
    if (!matchedCategory) {
      throw new HttpError(400, 'Category must be one of the supported studio categories');
    }
    data.category = matchedCategory;
  }

  if ('hourlyRate' in body && body.hourlyRate !== undefined) {
    const value = Number(body.hourlyRate);
    if (!Number.isFinite(value) || value <= 0) {
      throw new HttpError(400, 'hourlyRate must be a valid positive number');
    }
    data.hourlyRate = value;
  }

  const rawDeposit = body.securityDeposit !== undefined ? body.securityDeposit : body.deposit;
  if (rawDeposit !== undefined) {
    const value = Number(rawDeposit);
    if (!Number.isFinite(value) || value < 0) {
      throw new HttpError(400, 'securityDeposit must be a valid non-negative number');
    }
    data.securityDeposit = value;
  }

  const rawCapacity = body.capacity !== undefined ? body.capacity : body.maxCapacity;
  if (rawCapacity !== undefined) {
    const value = Number(rawCapacity);
    if (!Number.isInteger(value) || value < 1) {
      throw new HttpError(400, 'capacity must be a positive whole number');
    }
    data.capacity = value;
  }

  if ('location' in body && body.location !== undefined) {
    if (typeof body.location !== 'string' || !body.location.trim()) {
      throw new HttpError(400, 'location must be a non-empty string');
    }
    data.location = body.location.trim();
  }

  const rawImage = body.image !== undefined ? body.image : body.imageUrl;
  if (rawImage !== undefined) {
    if (typeof rawImage !== 'string' || !rawImage.trim()) {
      throw new HttpError(400, 'Image URL must be a valid HTTP or HTTPS URL');
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(rawImage.trim());
    } catch {
      throw new HttpError(400, 'Image URL must be a valid HTTP or HTTPS URL');
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new HttpError(400, 'Image URL must be a valid HTTP or HTTPS URL');
    }
    data.image = parsedUrl.toString();
  }

  const rawGallery = body.gallery !== undefined ? body.gallery : body.images;
  if (rawGallery !== undefined) {
    if (!Array.isArray(rawGallery)) {
      throw new HttpError(400, 'Gallery must be a list of valid HTTP or HTTPS URLs');
    }
    const validatedGallery = [];
    for (const item of rawGallery) {
      if (typeof item !== 'string' || !item.trim()) {
        throw new HttpError(400, 'Gallery must be a list of valid HTTP or HTTPS URLs');
      }
      let parsedUrl;
      try {
        parsedUrl = new URL(item.trim());
      } catch {
        throw new HttpError(400, 'Gallery must be a list of valid HTTP or HTTPS URLs');
      }
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new HttpError(400, 'Gallery must be a list of valid HTTP or HTTPS URLs');
      }
      validatedGallery.push(parsedUrl.toString());
    }
    data.gallery = validatedGallery;
  }

  if ('amenities' in body && body.amenities !== undefined) {
    if (!Array.isArray(body.amenities)
      || body.amenities.length > 30
      || body.amenities.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new HttpError(400, 'Amenities must be a list of up to 30 non-empty strings');
    }
    data.amenities = body.amenities.map((item) => item.trim());
  }

  const rawOverview = body.overview !== undefined ? body.overview : body.description;
  if (rawOverview !== undefined) {
    if (typeof rawOverview !== 'string' || !rawOverview.trim()) {
      throw new HttpError(400, 'overview must be a non-empty string');
    }
    data.overview = rawOverview.trim();
  }

  const rawOwnerPhoto = body.ownerPhoto !== undefined ? body.ownerPhoto : body.ownerImage;
  if (rawOwnerPhoto !== undefined && rawOwnerPhoto !== null) {
    if (typeof rawOwnerPhoto !== 'string') {
      throw new HttpError(400, 'ownerPhoto must be a valid HTTP or HTTPS URL');
    }
    const trimmed = rawOwnerPhoto.trim();
    if (trimmed) {
      let parsedUrl;
      try {
        parsedUrl = new URL(trimmed);
      } catch {
        throw new HttpError(400, 'ownerPhoto must be a valid HTTP or HTTPS URL');
      }
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new HttpError(400, 'ownerPhoto must be a valid HTTP or HTTPS URL');
      }
      data.ownerPhoto = parsedUrl.toString();
    } else {
      data.ownerPhoto = '';
    }
  }

  const requiredFields = [
    'title',
    'category',
    'hourlyRate',
    'securityDeposit',
    'capacity',
    'location',
    'image',
    'amenities',
    'overview',
  ];
  if (!partial) {
    for (const field of requiredFields) {
      if (!(field in data)) throw new HttpError(400, `${field} is required`);
    }
  }

  return data;
}

function getObjectId(id) {
  if (!ObjectId.isValid(id)) throw new HttpError(400, 'Studio ID is invalid');
  return new ObjectId(id);
}

export function createMyStudiosRouter(db) {
  const router = Router();
  const studios = db.collection('studios');

  router.get('/', verifyJWT, async (req, res, next) => {
    try {
      const items = await studios.find({ ownerEmail: req.user.email }).sort({ createdAt: -1 }).toArray();
      res.json({ studios: items });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function createStudiosRouter(db) {
  const router = Router();
  const studios = db.collection('studios');

  router.get('/featured', async (_req, res) => {
    const items = await studios.find({ available: { $ne: false } })
      .sort({ rating: -1, createdAt: -1 })
      .limit(6)
      .toArray();
    res.json({ studios: items });
  });

  router.get('/mine', verifyJWT, async (req, res) => {
    const items = await studios.find({ ownerEmail: req.user.email }).sort({ createdAt: -1 }).toArray();
    res.json({ studios: items });
  });

  router.get('/', async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
    const filter = { available: { $ne: false } };

    if (typeof req.query.category === 'string' && req.query.category.trim()) {
      const requestedCat = req.query.category.trim();
      const matched = STUDIO_CATEGORIES.find((c) => c.toLowerCase() === requestedCat.toLowerCase());
      filter.category = matched || requestedCat;
    }
    if (typeof req.query.location === 'string' && req.query.location.trim()) {
      filter.location = { $regex: escapeRegex(req.query.location.trim()), $options: 'i' };
    }
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const search = new RegExp(escapeRegex(req.query.search.trim()), 'i');
      filter.$or = [{ title: search }, { location: search }, { category: search }];
    }
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
    if ((req.query.minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0))
      || (req.query.maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0))) {
      throw new HttpError(400, 'Price filters must be non-negative numbers');
    }
    if (req.query.minPrice !== undefined || req.query.maxPrice !== undefined) {
      filter.hourlyRate = {};
      if (req.query.minPrice !== undefined) filter.hourlyRate.$gte = minPrice;
      if (req.query.maxPrice !== undefined) filter.hourlyRate.$lte = maxPrice;
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      rating: { rating: -1, createdAt: -1 },
      price_asc: { hourlyRate: 1 },
      price_desc: { hourlyRate: -1 },
    };
    const sort = sortOptions[req.query.sort] || sortOptions.newest;
    const [items, total] = await Promise.all([
      studios.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).toArray(),
      studios.countDocuments(filter),
    ]);
    res.json({ studios: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  });

  router.get('/:id', async (req, res) => {
    const studio = await studios.findOne({ _id: getObjectId(req.params.id) });
    if (!studio) throw new HttpError(404, 'Studio not found');
    res.json({ studio });
  });

  router.post('/', verifyJWT, async (req, res, next) => {
    try {
      const data = validateStudio(req.body);
      const studio = {
        title: data.title,
        category: data.category,
        hourlyRate: data.hourlyRate,
        securityDeposit: data.securityDeposit,
        capacity: data.capacity,
        location: data.location,
        image: data.image,
        gallery: data.gallery || [],
        amenities: data.amenities,
        overview: data.overview,
        ownerEmail: req.user.email,
        ownerName: req.user.name,
        ownerPhoto: data.ownerPhoto || '',
        rating: 0,
        reviewCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const { insertedId } = await studios.insertOne(studio);
      res.status(201).json({ studio: { ...studio, _id: insertedId } });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id', verifyJWT, async (req, res, next) => {
    try {
      const _id = getObjectId(req.params.id);
      const data = validateStudio(req.body, true);
      if (!Object.keys(data).length) throw new HttpError(400, 'At least one editable field is required');

      const result = await studios.findOneAndUpdate(
        { _id, ownerEmail: req.user.email },
        { $set: { ...data, updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      if (!result) {
        const exists = await studios.findOne({ _id }, { projection: { _id: 1 } });
        if (!exists) throw new HttpError(404, 'Studio not found');
        throw new HttpError(403, 'You can only update your own studios');
      }
      res.json({ message: 'Studio updated', studio: result });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', verifyJWT, async (req, res, next) => {
    try {
      const _id = getObjectId(req.params.id);
      const result = await studios.deleteOne({ _id, ownerEmail: req.user.email });
      if (!result.deletedCount) {
        const exists = await studios.findOne({ _id });
        if (!exists) throw new HttpError(404, 'Studio not found');
        throw new HttpError(403, 'You can only delete your own studios');
      }
      res.json({ success: true, message: 'Studio deleted' });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', verifyJWT, async (req, res, next) => {
    try {
      const _id = getObjectId(req.params.id);
      const data = validateStudio(req.body, true);
      if (!Object.keys(data).length) throw new HttpError(400, 'At least one editable field is required');

      const updates = { updatedAt: new Date() };
      if ('title' in data) updates.title = data.title;
      if ('category' in data) updates.category = data.category;
      if ('hourlyRate' in data) updates.hourlyRate = data.hourlyRate;
      if ('securityDeposit' in data) updates.securityDeposit = data.securityDeposit;
      if ('capacity' in data) updates.capacity = data.capacity;
      if ('location' in data) updates.location = data.location;
      if ('image' in data) updates.image = data.image;
      if ('gallery' in data) updates.gallery = data.gallery;
      if ('amenities' in data) updates.amenities = data.amenities;
      if ('overview' in data) updates.overview = data.overview;
      if ('ownerPhoto' in data) updates.ownerPhoto = data.ownerPhoto;

      const result = await studios.findOneAndUpdate(
        { _id, ownerEmail: req.user.email },
        { $set: updates },
        { returnDocument: 'after' },
      );
      if (!result) {
        const exists = await studios.findOne({ _id });
        if (!exists) throw new HttpError(404, 'Studio not found');
        throw new HttpError(403, 'You can only update your own studios');
      }
      res.json({ studio: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
