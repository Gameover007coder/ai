import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from '../middleware/auth.js';
import type { AuthContext } from '../middleware/auth.js';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');
const REFRESH_EXPIRY_DAYS = 7;
const ACCESS_EXPIRY_MIN = 15;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
});

async function hashPw(pw: string) {
  return bcrypt.hash(pw, 12);
}

async function verifyPw(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

async function createTokens(userId: string, email: string) {
  const accessToken = await new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_EXPIRY_MIN}m`)
    .sign(secret);
  const refreshToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { token: refreshToken, userId, expiresAt },
  });
  return { accessToken, refreshToken };
}

const app = new Hono<AuthContext>();

app.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, password, name } = c.req.valid('json');
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return c.json({ code: 'CONFLICT', message: 'Email already registered' }, 409);
  const passwordHash = await hashPw(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, name: name || null },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  const tokens = await createTokens(user.id, user.email);
  return c.json({ user, tokens }, 201);
});

app.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !(await verifyPw(password, user.passwordHash))) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Invalid credentials' }, 401);
  }
  const tokens = await createTokens(user.id, user.email);
  return c.json({ user: { id: user.id, email: user.email, name: user.name }, tokens });
});

app.post('/refresh', async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken: string }>();
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });
  if (!stored || stored.expiresAt < new Date()) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Invalid refresh token' }, 401);
  }
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  const tokens = await createTokens(stored.user.id, stored.user.email);
  return c.json(tokens);
});

app.post('/logout', async (c) => {
  const { refreshToken } = await c.req.json<{ refreshToken: string }>();
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  return c.json({ success: true });
});

export default app;
