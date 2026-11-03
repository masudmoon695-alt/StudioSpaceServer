import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { verifyJWT } from '../middleware/auth.js';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter(_req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      return callback(new HttpError(415, 'Only JPEG, PNG, and WebP images are supported'));
    }
    return callback(null, true);
  },
});

function isSupportedImage(buffer, mimetype) {
  if (mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimetype === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

function parseUpload(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(413, 'Image must be 5 MB or smaller'));
    }
    return next(error);
  });
}

export function createUploadsRouter() {
  const router = Router();

  router.post('/', verifyJWT, parseUpload, async (req, res) => {
    if (!config.imgbbApiKey) throw new HttpError(503, 'Image hosting is not configured');
    if (!req.file) throw new HttpError(400, 'Upload one image using the "image" form field');
    if (!isSupportedImage(req.file.buffer, req.file.mimetype)) {
      throw new HttpError(415, 'Uploaded file content is not a supported image');
    }

    const form = new FormData();
    form.append('image', new Blob([req.file.buffer], { type: req.file.mimetype }), 'studio-image');
    const endpoint = new URL('https://api.imgbb.com/1/upload');
    endpoint.searchParams.set('key', config.imgbbApiKey);
    const response = await fetch(endpoint, { method: 'POST', body: form });
    if (!response.ok) throw new HttpError(502, 'Image hosting service rejected the upload');
    const result = await response.json();
    if (result.success !== true || typeof result.data?.url !== 'string') {
      throw new HttpError(502, 'Image hosting service returned an invalid response');
    }
    res.status(201).json({ imageUrl: result.data.url, deleteUrl: result.data.delete_url });
  });

  return router;
}
