import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import type { AuthUser } from '../types/index.js';

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // In dev mode, allow a mock user via header X-Dev-User-Id for testing
    if (env.NODE_ENV === 'development') {
      const devUserId = req.headers['x-dev-user-id'] as string | undefined;
      if (devUserId) {
        const user = await prisma.user.findUnique({ where: { id: devUserId } });
        if (user) {
          req.user = { id: user.id, email: user.email, name: user.name, avatar: user.avatar ?? undefined };
          next();
          return;
        }
      }
    }

    const token = req.cookies?.token as string | undefined;
    if (!token) {
      res.status(401).json({ error: 'Unauthorized: No token provided' });
      return;
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      res.status(401).json({ error: 'Unauthorized: User not found' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ?? undefined,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}
