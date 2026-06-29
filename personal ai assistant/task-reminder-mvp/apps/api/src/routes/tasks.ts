import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { prisma, authMiddleware } from '../middleware/auth.js';
import { getQueue } from '../lib/queue.js';
import type { AuthContext } from '../middleware/auth.js';

const createSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  categoryId: z.string().optional(),
  reminders: z.array(
    z.object({
      remindAt: z.string().datetime(),
      channel: z.enum(['PUSH', 'EMAIL', 'SMS', 'EXTENSION']).optional(),
    })
  ).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  categoryId: z.string().optional().nullable(),
  reminders: z.array(
    z.object({
      remindAt: z.string().datetime(),
      channel: z.enum(['PUSH', 'EMAIL', 'SMS', 'EXTENSION']).optional(),
    })
  ).optional(),
});

const app = new Hono<AuthContext>();
app.use('*', authMiddleware);

app.get('/', async (c) => {
  const userId = c.get('userId');
  const query = c.req.query();
  const status = query.status as string | undefined;
  const priority = query.priority as string | undefined;
  const dueBefore = query.dueBefore as string | undefined;
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
  const skip = (page - 1) * limit;

  const where: any = { userId };
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (dueBefore) where.dueDate = { lte: new Date(dueBefore) };

  const [data, total] = await Promise.all([
    prisma.task.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      include: { category: true, reminders: { orderBy: { remindAt: 'asc' } } },
    }),
    prisma.task.count({ where }),
  ]);

  return c.json({
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

app.post('/', zValidator('json', createSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');
  const reminders = body.reminders || [];

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        userId,
        title: body.title,
        description: body.description || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        priority: body.priority || 'MEDIUM',
        categoryId: body.categoryId || null,
      },
      include: { reminders: true },
    });

    for (const r of reminders) {
      const remindAt = new Date(r.remindAt);
      const delay = remindAt.getTime() - Date.now();
      const job = await getQueue().add(
        'reminder',
        { type: 'TASK', id: created.id, userId },
        { delay: Math.max(0, delay), jobId: `reminder:${created.id}:${remindAt.toISOString()}` }
      );
      await tx.reminder.create({
        data: {
          type: 'TASK',
          taskId: created.id,
          remindAt,
          channel: (r.channel as any) || 'PUSH',
          jobId: job.id,
        },
      });
    }
    return created;
  });

  return c.json(task, 201);
});

app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const task = await prisma.task.findFirst({
    where: { id, userId },
    include: { category: true, reminders: true },
  });
  if (!task) return c.json({ code: 'NOT_FOUND', message: 'Task not found' }, 404);
  return c.json(task);
});

app.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) return c.json({ code: 'NOT_FOUND', message: 'Task not found' }, 404);

  const updated = await prisma.$transaction(async (tx) => {
    // Remove old reminders and cancel jobs if new reminders provided
    if (body.reminders) {
      const oldReminders = await tx.reminder.findMany({ where: { taskId: id } });
      for (const r of oldReminders) {
        if (r.jobId) await getQueue().remove(r.jobId);
      }
      await tx.reminder.deleteMany({ where: { taskId: id } });
      for (const r of body.reminders) {
        const remindAt = new Date(r.remindAt);
        const delay = remindAt.getTime() - Date.now();
        const job = await getQueue().add(
          'reminder',
          { type: 'TASK', id, userId },
          { delay: Math.max(0, delay), jobId: `reminder:${id}:${remindAt.toISOString()}` }
        );
        await tx.reminder.create({
          data: { type: 'TASK', taskId: id, remindAt, channel: (r.channel as any) || 'PUSH', jobId: job.id },
        });
      }
    }

    return tx.task.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        dueDate: body.dueDate === null ? null : body.dueDate ? new Date(body.dueDate) : undefined,
        priority: body.priority,
        status: body.status,
        categoryId: body.categoryId === null ? null : body.categoryId,
      },
      include: { category: true, reminders: true },
    });
  });

  return c.json(updated);
});

app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) return c.json({ code: 'NOT_FOUND', message: 'Task not found' }, 404);
  await prisma.task.delete({ where: { id } });
  return c.json({ success: true });
});

app.post('/:id/complete', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const existing = await prisma.task.findFirst({ where: { id, userId } });
  if (!existing) return c.json({ code: 'NOT_FOUND', message: 'Task not found' }, 404);
  const updated = await prisma.task.update({
    where: { id },
    data: { status: 'COMPLETED' },
    include: { category: true, reminders: true },
  });
  return c.json(updated);
});

export default app;
