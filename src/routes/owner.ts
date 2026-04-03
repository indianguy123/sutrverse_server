import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';
import { dayjs, todayInTz, getDayBoundsUtc, getWeekBoundsUtc } from '../lib/time.js';

const router = Router();

// All owner routes require OWNER role
router.use(requireAuth('OWNER'));

// GET /api/owner/dashboard — single aggregated response
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const salonId = process.env.SALON_ID;
    if (!salonId) {
      res.status(500).json({ data: null, error: 'SALON_ID not configured' });
      return;
    }

    const salon = await prisma.salon.findUnique({
      where: { id: salonId },
      select: { timezone: true },
    });
    const tz = salon?.timezone || 'Asia/Kolkata';
    const today = todayInTz(tz);
    const { start: todayStart, end: todayEnd } = getDayBoundsUtc(today, tz);
    const { start: weekStart, end: weekEnd } = getWeekBoundsUtc(today, tz);
    const now = new Date();

    const [todayBookings, revenueAgg, utilizationGroups, upcomingAppts, weekDensity, activeStylists] =
      await Promise.all([
        // Today's bookings
        prisma.appointment.findMany({
          where: {
            stylist: { salonId },
            startTime: { gte: todayStart, lt: todayEnd },
            status: { not: 'CANCELLED' },
          },
          select: {
            id: true,
            customerName: true,
            startTime: true,
            endTime: true,
            status: true,
            service: true,
            stylist: { select: { name: true, photoUrl: true } },
          },
          orderBy: { startTime: 'asc' },
        }),

        // Weekly revenue appointments
        prisma.appointment.findMany({
          where: {
            stylist: { salonId },
            status: 'COMPLETED',
            startTime: { gte: weekStart },
          },
          select: { id: true, startTime: true, price: true },
        }),

        // Utilization per stylist today
        prisma.appointment.groupBy({
          by: ['stylistId'],
          where: {
            stylist: { salonId },
            startTime: { gte: todayStart, lt: todayEnd },
            status: { not: 'CANCELLED' },
          },
          _count: { id: true },
        }),

        // Next 5 upcoming
        prisma.appointment.findMany({
          where: {
            stylist: { salonId },
            startTime: { gte: now },
            status: 'CONFIRMED',
          },
          orderBy: { startTime: 'asc' },
          take: 5,
          select: {
            id: true,
            customerName: true,
            customerPhone: true,
            startTime: true,
            endTime: true,
            service: true,
            stylist: { select: { name: true, photoUrl: true } },
          },
        }),

        // Week density for heatmap
        prisma.appointment.findMany({
          where: {
            stylist: { salonId },
            startTime: { gte: weekStart, lt: weekEnd },
            status: { not: 'CANCELLED' },
          },
          select: { startTime: true },
        }),

        // Active stylist count
        prisma.stylist.count({ where: { salonId, isActive: true } }),
      ]);

    let weeklyRevenueSum = 0;
    const dailyEarningsMap: Record<string, number> = {};
    revenueAgg.forEach((a: any) => {
      const price = Number(a.price || 0);
      weeklyRevenueSum += price;
      const day = dayjs(a.startTime).tz(tz).format('ddd');
      dailyEarningsMap[day] = (dailyEarningsMap[day] || 0) + price;
    });

    const dailyRevenue = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      name: day,
      total: dailyEarningsMap[day] || 0
    }));

    // Build heatmap data: group by day and hour
    const heatmap: Record<string, Record<number, number>> = {};
    weekDensity.forEach((appt: any) => {
      const d = dayjs(appt.startTime).tz(tz);
      const dayKey = d.format('YYYY-MM-DD');
      const hour = d.hour();
      if (!heatmap[dayKey]) heatmap[dayKey] = {};
      heatmap[dayKey][hour] = (heatmap[dayKey][hour] || 0) + 1;
    });

    res.json({
      data: {
        kpis: {
          todayBookings: todayBookings.length,
          weeklyRevenue: weeklyRevenueSum.toString(),
          weeklyCompleted: revenueAgg.length,
          activeStylists,
          utilization: utilizationGroups,
        },
        dailyRevenue,
        todayAppointments: todayBookings,
        upcoming: upcomingAppts,
        heatmap,
        timezone: tz,
      },
      error: null,
    });
  } catch (err) {
    console.error('[owner/dashboard] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// POST /api/owner/stylists — add stylist
router.post('/stylists', async (req: Request, res: Response) => {
  try {
    const salonId = process.env.SALON_ID;
    const { name, bio, photoUrl, specialties, slotDuration } = req.body;

    if (!name) {
      res.status(400).json({ data: null, error: 'Name is required' });
      return;
    }

    const stylist = await prisma.stylist.create({
      data: {
        salonId: salonId!,
        name,
        bio: bio || null,
        photoUrl: photoUrl || null,
        specialties: specialties || [],
        slotDuration: slotDuration || 30,
      },
    });

    res.status(201).json({ data: stylist, error: null });
  } catch (err) {
    console.error('[owner/stylists] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// PATCH /api/owner/stylists/:id — edit stylist
router.patch('/stylists/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, bio, photoUrl, specialties, slotDuration } = req.body;

    const stylist = await prisma.stylist.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(bio !== undefined && { bio }),
        ...(photoUrl !== undefined && { photoUrl }),
        ...(specialties !== undefined && { specialties: { set: specialties } }),
        ...(slotDuration !== undefined && { slotDuration }),
      },
    });

    res.json({ data: stylist, error: null });
  } catch (err) {
    console.error('[owner/stylists/:id] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// DELETE /api/owner/stylists/:id — soft delete
router.delete('/stylists/:id', async (req: Request, res: Response) => {
  try {
    const stylist = await prisma.stylist.update({
      where: { id: req.params.id as string },
      data: { isActive: false },
    });
    res.json({ data: stylist, error: null });
  } catch (err) {
    console.error('[owner/stylists/:id delete] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// PATCH /api/owner/salon/hours — upsert all 7 days
router.patch('/salon/hours', async (req: Request, res: Response) => {
  try {
    const salonId = process.env.SALON_ID;
    const { hours } = req.body; // Array of { dayOfWeek, openTime, closeTime, isClosed }

    if (!Array.isArray(hours)) {
      res.status(400).json({ data: null, error: 'hours array is required' });
      return;
    }

    // Delete existing and recreate
    await prisma.operatingHours.deleteMany({ where: { salonId: salonId! } });

    const created = await prisma.operatingHours.createMany({
      data: hours.map((h: any) => ({
        salonId: salonId!,
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime || '09:00',
        closeTime: h.closeTime || '18:00',
        isClosed: h.isClosed || false,
      })),
    });

    // Fetch the created records
    const allHours = await prisma.operatingHours.findMany({
      where: { salonId: salonId! },
      orderBy: { dayOfWeek: 'asc' },
    });

    res.json({ data: allHours, error: null });
  } catch (err) {
    console.error('[owner/salon/hours] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /api/owner/appointments — paginated upcoming
router.get('/appointments', async (req: Request, res: Response) => {
  try {
    const salonId = process.env.SALON_ID;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;

    const where: any = {
      stylist: { salonId },
    };

    if (status) {
      where.status = status;
    }

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
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
          price: true,
          createdAt: true,
          stylist: { select: { name: true, photoUrl: true } },
        },
        orderBy: { startTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.appointment.count({ where }),
    ]);

    res.json({
      data: {
        appointments,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      error: null,
    });
  } catch (err) {
    console.error('[owner/appointments] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// PATCH /api/owner/appointments/:id/cancel - cancel appointment
router.patch('/appointments/:id/cancel', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const salonId = process.env.SALON_ID;

    // Verify it belongs to this salon
    const appt = await prisma.appointment.findUnique({
      where: { id },
      include: { stylist: true },
    });

    if (!appt || appt.stylist.salonId !== salonId) {
      res.status(404).json({ data: null, error: 'Appointment not found' });
      return;
    }

    if (appt.status === 'CANCELLED') {
      res.status(400).json({ data: null, error: 'Appointment is already cancelled' });
      return;
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: { stylist: { select: { name: true, photoUrl: true } } },
    });

    res.json({ data: updated, error: null });
  } catch (err) {
    console.error('[owner/appointments/:id/cancel] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

// GET /api/owner/export-data - fetch raw records for Excel writing
router.get('/export-data', async (req: Request, res: Response) => {
  try {
    const salonId = process.env.SALON_ID;
    if (!salonId) {
      res.status(500).json({ data: null, error: 'SALON_ID not configured' });
      return;
    }

    const [stylists, upcomingBookings, revenues] = await Promise.all([
      prisma.stylist.findMany({
        where: { salonId }
      }),
      prisma.appointment.findMany({
        where: {
          stylist: { salonId },
          status: 'CONFIRMED',
          startTime: { gte: new Date() }
        },
        include: { stylist: { select: { name: true } } },
        orderBy: { startTime: 'asc' }
      }),
      prisma.appointment.findMany({
        where: {
          stylist: { salonId },
          status: 'COMPLETED'
        },
        include: { stylist: { select: { name: true } } },
        orderBy: { startTime: 'desc' }
      })
    ]);

    // Format Data logically for worksheet conversion
    const formattedStylists = stylists.map(s => ({
      ID: s.id,
      Name: s.name,
      Specialties: s.specialties.join(', '),
      Slot_Duration_Mins: s.slotDuration,
      Active: s.isActive ? 'Yes' : 'No'
    }));

    const formattedUpcoming = upcomingBookings.map(b => ({
      ID: b.id,
      Customer: b.customerName,
      Phone: b.customerPhone || 'N/A',
      Email: b.customerEmail || 'N/A',
      Stylist: b.stylist?.name || 'N/A',
      Service: b.service,
      Start_Time: b.startTime,
      End_Time: b.endTime,
      Walk_In: b.isWalkIn ? 'Yes' : 'No',
      Price_Assigned: b.price ? Number(b.price) : 0
    }));

    const formattedRevenues = revenues.map(r => ({
      ID: r.id,
      Customer: r.customerName,
      Stylist: r.stylist?.name || 'N/A',
      Service: r.service,
      Start_Time: r.startTime,
      Price_Earned: r.price ? Number(r.price) : 0,
      Walk_In: r.isWalkIn ? 'Yes' : 'No'
    }));

    res.json({
      data: {
        stylists: formattedStylists,
        upcomingBookings: formattedUpcoming,
        revenues: formattedRevenues
      },
      error: null
    });
  } catch (err) {
    console.error('[owner/export-data] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
