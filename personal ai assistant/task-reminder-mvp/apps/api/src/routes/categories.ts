import { Hono } from 'hono';
import { prisma, authMiddleware } from '../middleware/auth.js';
import type { AuthContext } from '../middleware/auth.js';

const app = new Hono<AuthContext>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const userId = c.get('userId');
  const cats = await prisma.category.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  return c.json(cats);
});

app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ name: string; color?: string }>();
  const cat = await prisma.category.create({
    data: { userId, name: body.name, color: body.color || '#3b82f6' },
  });
  return c.json(cat, 201);
});

app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const existing = await prisma.category.findFirst({ where: { id, userId } });
  if (!existing) return c.json({ code: 'NOT_FOUND', message: 'Category not found' }, 404);
  await prisma.category.delete({ where: { id } });
  return c.json({ success: true });
});

export default app;
