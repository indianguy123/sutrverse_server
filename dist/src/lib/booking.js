import { prismaTransaction } from './prisma.js';
import { computeLockKey } from './locks.js';
import { SlotConflictError } from './errors.js';
import { Prisma } from '@prisma/client';
/**
 * 5-layer double-booking prevention:
 * 1. Optimistic range check (pre-lock fast read)
 * 2. PostgreSQL advisory lock + serializable transaction
 * 3. DB unique constraint (final backstop)
 * 4. Idempotency key (handled before this function is called)
 * 5. Rate limiting (handled at route level)
 */
export async function createAppointmentSafe(payload) {
    const lockKey = computeLockKey(payload.stylistId, payload.startTime);
    return await prismaTransaction.$transaction(async (tx) => {
        // Layer 2a: Acquire advisory lock for this (stylist, slot) pair
        const lockResult = await tx.$queryRaw `
        SELECT pg_try_advisory_xact_lock(${lockKey}::bigint) AS acquired
      `;
        if (!lockResult[0]?.acquired) {
            throw new SlotConflictError('Slot is being booked right now — please try again');
        }
        // Layer 2b: Re-check overlap inside the transaction (MVCC correctness)
        const conflict = await tx.appointment.findFirst({
            where: {
                stylistId: payload.stylistId,
                status: { not: 'CANCELLED' },
                OR: [
                    { startTime: { gte: payload.startTime, lt: payload.endTime } },
                    { endTime: { gt: payload.startTime, lte: payload.endTime } },
                    { AND: [{ startTime: { lte: payload.startTime } }, { endTime: { gte: payload.endTime } }] },
                ],
            },
            select: { id: true },
        });
        if (conflict) {
            throw new SlotConflictError('Slot no longer available');
        }
        // Create the appointment
        return await tx.appointment.create({
            data: {
                stylistId: payload.stylistId,
                customerName: payload.customerName,
                customerPhone: payload.customerPhone,
                customerEmail: payload.customerEmail || null,
                service: payload.service,
                startTime: payload.startTime,
                endTime: payload.endTime,
                isWalkIn: payload.isWalkIn || false,
                notes: payload.notes || null,
                price: payload.price ? new Prisma.Decimal(payload.price) : null,
                idempotencyKey: payload.idempotencyKey || null,
            },
            include: {
                stylist: {
                    select: { name: true, photoUrl: true, salon: { select: { name: true, timezone: true, email: true } } },
                },
            },
        });
    }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 5000,
    });
}
//# sourceMappingURL=booking.js.map