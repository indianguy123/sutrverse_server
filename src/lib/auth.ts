import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { prisma } from './prisma.js';
import { AuthError } from './errors.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface TokenPayload {
  userId: string;
  email: string;
  role: 'OWNER' | 'STYLIST';
  stylistId?: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Auth middleware — extracts and validates JWT from Authorization header
 * Attaches user info to req.user
 */
export function requireAuth(requiredRole?: 'OWNER' | 'STYLIST') {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new AuthError('Missing or invalid authorization header');
      }

      const token = authHeader.split(' ')[1];
      const payload = verifyToken(token);

      if (requiredRole && payload.role !== requiredRole) {
        throw new AuthError('Insufficient permissions', 403);
      }

      // Attach to request
      (req as any).user = payload;
      next();
    } catch (err) {
      if (err instanceof AuthError) {
        next(err);
      } else if (err instanceof jwt.JsonWebTokenError) {
        next(new AuthError('Invalid token'));
      } else {
        next(err);
      }
    }
  };
}

/**
 * Login handler
 */
export async function loginUser(email: string, password: string): Promise<{ token: string; user: TokenPayload }> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { stylist: { select: { id: true } } },
  });

  if (!user) {
    throw new AuthError('Invalid credentials');
  }

  const valid = await comparePassword(password, user.password);
  if (!valid) {
    throw new AuthError('Invalid credentials');
  }

  const payload: TokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    stylistId: user.stylist?.id,
  };

  const token = signToken(payload);
  return { token, user: payload };
}
