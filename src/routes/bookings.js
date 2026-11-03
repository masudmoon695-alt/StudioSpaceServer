import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { HttpError } from '../errors.js';
import { verifyJWT } from '../middleware/auth.js';
import { parseDate } from '../validation.js';

function getObjectId(id, label) {
  if (!ObjectId.isValid(id)) throw new HttpError(400, `${label} ID is invalid`);
  return new ObjectId(id);
}

export function createBookingsRouter(db) {
  const router = Router();
  const bookings = db.collection('bookings');
  const studios = db.collection('studios');

  router.post('/', verifyJWT, async (req, res) => {
    const studioId = getObjectId(req.body.studioId, 'Studio');
    const startAt = parseDate(req.body.startAt);
    const endAt = parseDate(req.body.endAt);
    if (!startAt || !endAt || startAt <= new Date() || endAt <= startAt) {
      throw new HttpError(400, 'Provide a future startAt and an endAt later than startAt');
    }

    const studio = await studios.findOne({ _id: studioId, available: { $ne: false } });
    if (!studio) throw new HttpError(404, 'Studio is unavailable or does not exist');
    if (studio.ownerEmail === req.user.email) throw new HttpError(403, 'You cannot book your own studio');

    const collision = await bookings.findOne({
      studioId: studioId.toString(),
      status: 'Confirmed',
      startAt: { $lt: endAt },
      endAt: { $gt: startAt },
    });
    if (collision) throw new HttpError(409, 'The selected time overlaps with a confirmed booking');

    const durationHours = (endAt - startAt) / (60 * 60 * 1000);
    const booking = {
      studioId: studioId.toString(),
      studioTitle: studio.title,
      studioImage: studio.image,
      hostEmail: studio.ownerEmail,
      userEmail: req.user.email,
      userName: req.user.name,
      startAt,
      endAt,
      durationHours,
      hourlyRate: studio.hourlyRate,
      totalPrice: Math.round(studio.hourlyRate * durationHours * 100) / 100,
      status: 'Pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { insertedId } = await bookings.insertOne(booking);
    res.status(201).json({ booking: { ...booking, _id: insertedId } });
  });

  async function listMyBookings(req, res, next) {
    try {
      const items = await bookings.find({
        $or: [{ userEmail: req.user.email }, { customerEmail: req.user.email }],
      }).sort({ createdAt: -1 }).toArray();
      const normalized = items.map((item) => ({
        ...item,
        userEmail: item.userEmail || item.customerEmail,
      }));
      res.json({ bookings: normalized });
    } catch (error) {
      next(error);
    }
  }

  router.get('/my', verifyJWT, listMyBookings);
  router.get('/mine', verifyJWT, listMyBookings);

  router.get('/host', verifyJWT, async (req, res) => {
    const ownedStudios = await studios.find({ ownerEmail: req.user.email }, { projection: { _id: 1 } }).toArray();
    const studioIds = ownedStudios.map((studio) => studio._id.toString());
    const items = await bookings.find({ studioId: { $in: studioIds } }).sort({ createdAt: -1 }).toArray();
    res.json({ bookings: items });
  });

  router.patch('/:id/cancel', verifyJWT, async (req, res, next) => {
    try {
      const _id = getObjectId(req.params.id, 'Booking');
      const booking = await bookings.findOne({ _id });
      if (!booking) throw new HttpError(404, 'Booking not found');
      if (booking.userEmail !== req.user.email && booking.customerEmail !== req.user.email) {
        throw new HttpError(403, 'You can only cancel your own bookings');
      }
      if (booking.status !== 'Pending') throw new HttpError(400, 'Only pending bookings can be cancelled');

      const result = await bookings.findOneAndUpdate(
        { _id, status: 'Pending' },
        { $set: { status: 'Cancelled', cancelledAt: new Date(), updatedAt: new Date() } },
        { returnDocument: 'after' },
      );
      res.json({ booking: result });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:id/status', verifyJWT, async (req, res) => {
    const _id = getObjectId(req.params.id, 'Booking');
    const status = req.body.status;
    if (!['Pending', 'Confirmed', 'Completed', 'Cancelled'].includes(status)) {
      throw new HttpError(400, 'Status must be Confirmed, Cancelled, or Completed');
    }

    const booking = await bookings.findOne({ _id });
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.hostEmail !== req.user.email) throw new HttpError(403, 'Only the studio host can update this booking');
    if (['Cancelled', 'Completed'].includes(booking.status) && status !== booking.status) {
      throw new HttpError(409, 'Cancelled and completed bookings cannot be changed');
    }
    if (status === 'Completed' && booking.status !== 'Confirmed') {
      throw new HttpError(409, 'Only confirmed bookings can be completed');
    }
    if (status === 'Confirmed') {
      const collision = await bookings.findOne({
        _id: { $ne: _id },
        studioId: booking.studioId,
        status: 'Confirmed',
        startAt: { $lt: booking.endAt },
        endAt: { $gt: booking.startAt },
      });
      if (collision) throw new HttpError(409, 'The selected time overlaps with another confirmed booking');
    }

    const result = await bookings.findOneAndUpdate(
      { _id, hostEmail: req.user.email },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    res.json({ message: `Booking ${status.toLowerCase()}`, booking: result });
  });

  return router;
}
