import { createMiddleware } from 'hono/factory';
import { jwtVerify } from 'jose';
import type { Context } from 'hono';
import { PrismaClient } from '@task-reminder/database';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});

export interface AuthContext extends Context {
  Variables: {
    userId: string;
    email: string;
  };
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const auth = c.req.header('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Missing token' }, 401);
  }
  const token = auth.slice(7);
  try {
    const { payload } = await jwtVerify(token, secret, { clockTolerance: 60 });
    c.set('userId', payload.sub as string);
    c.set('email', payload.email as string);
    await next();
  } catch {
    return c.json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' }, 401);
  }
});
