import { dayjs } from './time.js';
/**
 * Compute all slots for a given day.
 * Pure function — zero DB calls, fully unit-testable.
 *
 * @param date "YYYY-MM-DD" in salon's local timezone
 * @param timezone "Asia/Kolkata"
 * @param openTime "09:00" (local)
 * @param closeTime "18:00" (local)
 * @param slotDurationMin 30 or 60
 * @param bookedSlots array of { startTime, endTime } in UTC
 */
export function computeSlots(date, timezone, openTime, closeTime, slotDurationMin, bookedSlots) {
    const slots = [];
    // Parse open/close as local datetime, convert to UTC
    const openUtc = dayjs.tz(`${date} ${openTime}`, 'YYYY-MM-DD HH:mm', timezone).utc();
    const closeUtc = dayjs.tz(`${date} ${closeTime}`, 'YYYY-MM-DD HH:mm', timezone).utc();
    if (!openUtc.isValid() || !closeUtc.isValid())
        return slots;
    let current = openUtc;
    while (current.add(slotDurationMin, 'minute').isBefore(closeUtc) ||
        current.add(slotDurationMin, 'minute').isSame(closeUtc)) {
        const slotStart = current.toDate();
        const slotEnd = current.add(slotDurationMin, 'minute').toDate();
        // Check overlap with any booked slot
        const isBooked = bookedSlots.some((booked) => {
            return (slotStart < booked.endTime && slotEnd > booked.startTime);
        });
        // Don't show past slots for today
        const now = new Date();
        const isPast = slotStart < now;
        slots.push({
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            available: !isBooked && !isPast,
        });
        current = current.add(slotDurationMin, 'minute');
    }
    return slots;
}
//# sourceMappingURL=availability.js.map