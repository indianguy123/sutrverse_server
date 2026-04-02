import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);
export { dayjs };
/**
 * Convert a local date string + time string to UTC Date
 * @param dateStr "YYYY-MM-DD"
 * @param timeStr "HH:mm"
 * @param tz "Asia/Kolkata"
 */
export function localToUtc(dateStr, timeStr, tz) {
    const localStr = `${dateStr} ${timeStr}`;
    return dayjs.tz(localStr, 'YYYY-MM-DD HH:mm', tz).utc().toDate();
}
/**
 * Format a UTC Date to local time string
 */
export function utcToLocal(date, tz, format = 'YYYY-MM-DD HH:mm') {
    return dayjs(date).tz(tz).format(format);
}
/**
 * Get start and end of a day in UTC for a given timezone
 */
export function getDayBoundsUtc(dateStr, tz) {
    const start = dayjs.tz(`${dateStr} 00:00`, 'YYYY-MM-DD HH:mm', tz).utc().toDate();
    const end = dayjs.tz(`${dateStr} 23:59:59`, 'YYYY-MM-DD HH:mm:ss', tz).utc().toDate();
    return { start, end };
}
/**
 * Get current date string in a timezone
 */
export function todayInTz(tz) {
    return dayjs().tz(tz).format('YYYY-MM-DD');
}
/**
 * Get start of the week (Monday) in UTC
 */
export function getWeekBoundsUtc(dateStr, tz) {
    const day = dayjs.tz(dateStr, tz);
    const monday = day.startOf('week').add(1, 'day'); // dayjs week starts on Sunday
    const sunday = monday.add(6, 'day').endOf('day');
    return {
        start: monday.utc().toDate(),
        end: sunday.utc().toDate(),
    };
}
//# sourceMappingURL=time.js.map