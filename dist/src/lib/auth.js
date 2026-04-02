import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { AuthError } from './errors.js';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
export function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
export function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}
export async function hashPassword(password) {
    return bcrypt.hash(password, 12);
}
export async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}
/**
 * Auth middleware — extracts and validates JWT from Authorization header
 * Attaches user info to req.user
 */
export function requireAuth(requiredRole) {
    return async (req, _res, next) => {
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
            req.user = payload;
            next();
        }
        catch (err) {
            if (err instanceof AuthError) {
                next(err);
            }
            else if (err instanceof jwt.JsonWebTokenError) {
                next(new AuthError('Invalid token'));
            }
            else {
                next(err);
            }
        }
    };
}
/**
 * Login handler
 */
export async function loginUser(email, password) {
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
    const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        stylistId: user.stylist?.id,
    };
    const token = signToken(payload);
    return { token, user: payload };
}
//# sourceMappingURL=auth.js.map