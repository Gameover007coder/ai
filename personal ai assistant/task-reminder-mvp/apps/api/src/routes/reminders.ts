import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { prisma, authMiddleware } from '../middleware/auth.js';
import { getQueue } from '../lib/queue.js';
import type { AuthContext } from '../middleware/auth.js';

const createSchema = z.object({
  remindAt: z.string().datetime(),
  channel: z.enum(['PUSH', 'EMAIL', 'SMS', 'EXTENSION']).optional(),
  taskId: z.string().optional(),
  appointmentId: z.string().optional(),
});

const app = new Hono<AuthContext>();
app.use('*', authMiddleware);

app.get('/upcoming', async (c) => {
  const userId = c.get('userId');
  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const reminders = await prisma.reminder.findMany({
    where: {
      OR: [
        { task: { userId } },
        { appointment: { userId } },
      ],
      remindAt: { gte: now, lte: next24h },
      sentAt: null,
    },
    orderBy: { remindAt: 'asc' },
    include: { task: true, appointment: true },
  });

  return c.json(reminders);
});

app.post('/', zValidator('json', createSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');
  const remindAt = new Date(body.remindAt);
  const delay = remindAt.getTime() - Date.now();

  let type: 'TASK' | 'APPOINTMENT' | 'CUSTOM' = 'CUSTOM';
  let taskId: string | undefined;
  let appointmentId: string | undefined;
  if (body.taskId) {
    const task = await prisma.task.findFirst({ where: { id: body.taskId, userId } });
    if (!task) return c.json({ code: 'NOT_FOUND', message: 'Task not found' }, 404);
    type = 'TASK';
    taskId = body.taskId;
  } else if (body.appointmentId) {
    const appt = await prisma.appointment.findFirst({ where: { id: body.appointmentId, userId } });
    if (!appt) return c.json({ code: 'NOT_FOUND', message: 'Appointment not found' }, 404);
    type = 'APPOINTMENT';
    appointmentId = body.appointmentId;
  }

  const job = await getQueue().add(
    'reminder',
    { type, id: taskId || appointmentId, userId },
    { delay: Math.max(0, delay), jobId: `reminder:custom:${crypto.randomUUID()}` }
  );

  const reminder = await prisma.reminder.create({
    data: {
      type,
      taskId: taskId || null,
      appointmentId: appointmentId || null,
      remindAt,
      channel: (body.channel as any) || 'PUSH',
      jobId: job.id,
    },
  });

  return c.json(reminder, 201);
});

app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const existing = await prisma.reminder.findFirst({
    where: {
      id,
      OR: [{ task: { userId } }, { appointment: { userId } }],
    },
  });
  if (!existing) return c.json({ code: 'NOT_FOUND', message: 'Reminder not found' }, 404);
  if (existing.jobId) await getQueue().remove(existing.jobId);
  await prisma.reminder.delete({ where: { id } });
  return c.json({ success: true });
});

export default app;
