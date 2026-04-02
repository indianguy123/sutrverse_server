import { Router, Request, Response } from 'express';
import { loginUser } from '../lib/auth.js';
import { AuthError } from '../lib/errors.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ data: null, error: 'Email and password are required' });
      return;
    }

    const result = await loginUser(email, password);
    res.json({ data: result, error: null });
  } catch (err) {
    if (err instanceof AuthError) {
      res.status(err.statusCode).json({ data: null, error: err.message });
      return;
    }
    console.error('[auth/login] Error:', err);
    res.status(500).json({ data: null, error: 'Internal server error' });
  }
});

export default router;
