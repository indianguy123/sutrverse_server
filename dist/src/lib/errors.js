export class SlotConflictError extends Error {
    constructor(message = 'Slot no longer available') {
        super(message);
        this.name = 'SlotConflictError';
    }
}
export function isPrismaUniqueError(err) {
    return (typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        err.code === 'P2002');
}
export class AuthError extends Error {
    constructor(message = 'Unauthorized', statusCode = 401) {
        super(message);
        this.name = 'AuthError';
        this.statusCode = statusCode;
    }
}
//# sourceMappingURL=errors.js.map