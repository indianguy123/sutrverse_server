export class SlotConflictError extends Error {
  constructor(message: string = 'Slot no longer available') {
    super(message);
    this.name = 'SlotConflictError';
  }
}

export function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}

export class AuthError extends Error {
  public statusCode: number;
  constructor(message: string = 'Unauthorized', statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}
