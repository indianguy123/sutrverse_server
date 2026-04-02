import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, TokenPayload } from '../lib/auth.js';
import { createAppointmentSafe, BookingPayload } from '../lib/booking.js';
import { sendBookingConfirmation } from '../lib/email.js';
import { SlotConflictError, isPrismaUniqueError } from '../lib/errors.js';
import { dayjs } from '../lib/time.js';

const router = Router();

// All stylist routes require STYLIST role
router.use(requireAuth('STYLIST'));

// GET /api/stylist/schedule — appointments for date range
router.get('/schedule', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    if (!user.stylistId) {
      res.status(400).json({ data: null, error: 'No stylist profile linked to this account' });
      return;
    }

    const from = req.query.from as string;
    const to = req.query.to as string;

    if (!from || !to) {
      res.status(400).json({ data: null, error: 'from and to query parameters required (YYYY-MM-DD)' });
      return;
    }

    const stylist = await prisma.stylist.findUnique({
      where: { id: user.stylistId },
      select: { salon: { select: { timezone: true } } },
    });
    const tz = stylist?.salon?.timezone || 'Asia/Kolkata';

    const fromDate = dayjs.tz(`${from} 00:00`, 'YYYY-MM-DD HH:mm', tz).utc().toDate();
    const toDate = dayjs.tz(`${to} 23:59:59`, 'YYYY-MM-DD HH:mm:ss', tz).utc().toDate();

    const appointments = await prisma.appointment.findMany({
      where: {
        stylistId: user.stylistId,
        startTime: { gte: fromDate },
        endTime: { lte: toDate },
        status: { not: 'CANCELLED' },
      },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        service: true,
        startTime: true,
        endTime: true,
        status: true,
        isWalkIn: true,
        notes: true,
        price: true,
      },
      orderBy: { startTime: 'asc' },
    });

    res.json({ data: { appointments, timezone: tz }, error: null });
  } catch (err) {
    console.error('[stylist/schedule] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// POST /api/stylist/walk-in — log walk-in appointment
router.post('/walk-in', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    if (!user.stylistId) {
      res.status(400).json({ data: null, error: 'No stylist profile linked to this account' });
      return;
    }

    const { customerName, customerPhone, customerEmail, service, startTime, notes, price } = req.body;

    if (!customerName || !customerPhone || !service || !startTime) {
      res.status(400).json({
        data: null,
        error: 'Missing required fields: customerName, customerPhone, service, startTime',
      });
      return;
    }

    // Get stylist for slot duration
    const stylist = await prisma.stylist.findUnique({
      where: { id: user.stylistId },
      select: {
        slotDuration: true,
        salon: { select: { name: true, timezone: true, email: true } },
      },
    });

    if (!stylist) {
      res.status(404).json({ data: null, error: 'Stylist not found' });
      return;
    }

    const proposedStart = new Date(startTime);
    const proposedEnd = dayjs(proposedStart).add(stylist.slotDuration, 'minute').toDate();

    const payload: BookingPayload = {
      stylistId: user.stylistId,
      customerName,
      customerPhone,
      customerEmail: customerEmail || undefined,
      service,
      startTime: proposedStart,
      endTime: proposedEnd,
      isWalkIn: true,
      notes,
      price: price ? parseFloat(price) : undefined,
    };

    try {
      const appointment = await createAppointmentSafe(payload);

      // Fire-and-forget email for walk-ins too
      if (customerEmail && stylist.salon) {
        sendBookingConfirmation({
          id: appointment.id,
          customerName,
          customerEmail,
          service,
          startTime: proposedStart,
          stylist: { name: appointment.stylist?.name || 'Stylist' },
          salon: stylist.salon,
        }).catch((err) => {
          console.error('[email] walk-in confirmation failed', appointment.id, err);
        });
      }

      res.status(201).json({ data: appointment, error: null });
    } catch (err) {
      if (err instanceof SlotConflictError) {
        res.status(409).json({ data: null, error: err.message });
        return;
      }
      if (isPrismaUniqueError(err)) {
        res.status(409).json({ data: null, error: 'Slot conflict' });
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error('[stylist/walk-in] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /api/stylist/history — past appointments, paginated
router.get('/history', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as TokenPayload;
    if (!user.stylistId) {
      res.status(400).json({ data: null, error: 'No stylist profile linked to this account' });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const now = new Date();

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          stylistId: user.stylistId,
          endTime: { lt: now },
        },
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          service: true,
          startTime: true,
          endTime: true,
          status: true,
          isWalkIn: true,
          price: true,
          notes: true,
        },
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.appointment.count({
        where: {
          stylistId: user.stylistId,
          endTime: { lt: now },
        },
      }),
    ]);

    res.json({
      data: {
        appointments,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      error: null,
    });
  } catch (err) {
    console.error('[stylist/history] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
