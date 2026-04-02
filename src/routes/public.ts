import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { computeSlots } from '../lib/availability.js';
import { createAppointmentSafe, BookingPayload } from '../lib/booking.js';
import { sendBookingConfirmation } from '../lib/email.js';
import { SlotConflictError, isPrismaUniqueError } from '../lib/errors.js';
import { dayjs } from '../lib/time.js';

const router = Router();

// GET /api/public/stylists — list active stylists
router.get('/stylists', async (_req: Request, res: Response) => {
  try {
    const salonId = process.env.SALON_ID;
    const stylists = await prisma.stylist.findMany({
      where: { salonId, isActive: true },
      select: {
        id: true,
        name: true,
        bio: true,
        photoUrl: true,
        specialties: true,
        slotDuration: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: stylists, error: null });
  } catch (err) {
    console.error('[public/stylists] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /api/public/stylists/:id/availability — compute slots for a date
router.get('/stylists/:id/availability', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      res.status(400).json({ data: null, error: 'date query parameter required (YYYY-MM-DD)' });
      return;
    }

    // Get stylist with salon info
    const stylist = await prisma.stylist.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slotDuration: true,
        isActive: true,
        salon: {
          select: {
            timezone: true,
            operatingHours: true,
          },
        },
      },
    });

    if (!stylist || !stylist.isActive) {
      res.status(404).json({ data: null, error: 'Stylist not found' });
      return;
    }

    // Find operating hours for the requested day
    const requestedDate = dayjs(date);
    const dayOfWeek = requestedDate.day(); // 0 = Sunday
    const hours = (stylist as any).salon.operatingHours.find((h: any) => h.dayOfWeek === dayOfWeek);

    if (!hours || hours.isClosed) {
      res.json({ data: { slots: [], closed: true }, error: null });
      return;
    }

    // Get booked appointments for that day
    const startOfDay = dayjs.tz(`${date} 00:00`, 'YYYY-MM-DD HH:mm', (stylist as any).salon.timezone).utc().toDate();
    const endOfDay = dayjs.tz(`${date} 23:59:59`, 'YYYY-MM-DD HH:mm:ss', (stylist as any).salon.timezone).utc().toDate();

    const bookedAppointments = await prisma.appointment.findMany({
      where: {
        stylistId: id,
        status: { not: 'CANCELLED' },
        startTime: { gte: startOfDay },
        endTime: { lte: endOfDay },
      },
      select: { startTime: true, endTime: true },
    });

    const slots = computeSlots(
      date as string,
      (stylist as any).salon.timezone,
      hours.openTime,
      hours.closeTime,
      stylist.slotDuration,
      bookedAppointments
    );

    res.json({
      data: {
        stylist: { id: stylist.id, name: stylist.name, slotDuration: stylist.slotDuration },
        date,
        slots,
        closed: false,
      },
      error: null,
    });
  } catch (err) {
    console.error('[public/availability] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// POST /api/public/appointments — create booking
router.post('/appointments', async (req: Request, res: Response) => {
  try {
    const { stylistId, customerName, customerPhone, customerEmail, service, startTime, notes } = req.body;

    // Validate required fields
    if (!stylistId || !customerName || !customerPhone || !service || !startTime) {
      res.status(400).json({
        data: null,
        error: 'Missing required fields: stylistId, customerName, customerPhone, service, startTime',
      });
      return;
    }

    // Layer 4: Idempotency key check
    const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
    if (idempotencyKey) {
      const existing = await prisma.appointment.findUnique({
        where: { idempotencyKey },
        include: {
          stylist: {
            select: { name: true, photoUrl: true, salon: { select: { name: true, timezone: true, email: true } } },
          },
        },
      });
      if (existing) {
        res.status(200).json({ data: existing, error: null });
        return;
      }
    }

    // Get stylist to compute endTime
    const stylist = await prisma.stylist.findUnique({
      where: { id: stylistId },
      select: { slotDuration: true, isActive: true },
    });

    if (!stylist || !stylist.isActive) {
      res.status(404).json({ data: null, error: 'Stylist not found or inactive' });
      return;
    }

    const proposedStart = new Date(startTime);
    const proposedEnd = dayjs(proposedStart).add(stylist.slotDuration, 'minute').toDate();

    // Layer 1: Optimistic range check (fast pre-lock read)
    const conflict = await prisma.appointment.findFirst({
      where: {
        stylistId,
        status: { not: 'CANCELLED' },
        OR: [
          { startTime: { gte: proposedStart, lt: proposedEnd } },
          { endTime: { gt: proposedStart, lte: proposedEnd } },
          { AND: [{ startTime: { lte: proposedStart } }, { endTime: { gte: proposedEnd } }] },
        ],
      },
      select: { id: true },
    });

    if (conflict) {
      res.status(409).json({ data: null, error: 'Slot is no longer available' });
      return;
    }

    // Layers 2 & 3: Advisory lock + serializable transaction + DB unique constraint
    const payload: BookingPayload = {
      stylistId,
      customerName,
      customerPhone,
      customerEmail: customerEmail || undefined,
      service,
      startTime: proposedStart,
      endTime: proposedEnd,
      notes,
      idempotencyKey,
    };

    try {
      const appointment = await createAppointmentSafe(payload);

      // Fire-and-forget email
      if (appointment.customerEmail && appointment.stylist?.salon) {
        sendBookingConfirmation({
          id: appointment.id,
          customerName: appointment.customerName,
          customerEmail: appointment.customerEmail,
          service: appointment.service,
          startTime: appointment.startTime,
          stylist: { name: appointment.stylist.name },
          salon: appointment.stylist.salon,
        }).catch((err) => {
          console.error('[email] confirmation failed for appointment', appointment.id, err);
        });
      }

      res.status(201).json({ data: appointment, error: null });
    } catch (err) {
      if (err instanceof SlotConflictError) {
        res.status(409).json({ data: null, error: err.message });
        return;
      }
      if (isPrismaUniqueError(err)) {
        res.status(409).json({ data: null, error: 'Slot no longer available' });
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error('[public/appointments] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /api/public/appointments/:id — booking lookup
router.get('/appointments/:id', async (req: Request, res: Response) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id as string },
      include: {
        stylist: {
          select: {
            name: true,
            photoUrl: true,
            salon: { select: { name: true, timezone: true, phone: true, email: true } },
          },
        },
      },
    });

    if (!appointment) {
      res.status(404).json({ data: null, error: 'Appointment not found' });
      return;
    }

    res.json({ data: appointment, error: null });
  } catch (err) {
    console.error('[public/appointments/:id] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
