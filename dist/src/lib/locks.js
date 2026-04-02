/**
 * FNV-32a hash of stylistId + startTime ISO string
 * Clamped to PostgreSQL advisory lock int range (0 to 2^31-1)
 */
export function computeLockKey(stylistId, startTime) {
    const input = stylistId + startTime.toISOString();
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = (hash * 16777619) >>> 0;
    }
    return hash % 2147483647;
}
//# sourceMappingURL=locks.js.map