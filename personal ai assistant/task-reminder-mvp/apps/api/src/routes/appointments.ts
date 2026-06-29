import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { prisma, authMiddleware } from '../middleware/auth.js';
import { getQueue } from '../lib/queue.js';
import type { AuthContext } from '../middleware/auth.js';

const createSchema = z.object({
  title: z.string().min(1).max(500),
  location: z.string().max(500).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  description: z.string().max(5000).optional(),
  reminders: z.array(
    z.object({
      remindAt: z.string().datetime(),
      channel: z.enum(['PUSH', 'EMAIL', 'SMS', 'EXTENSION']).optional(),
    })
  ).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  location: z.string().max(500).optional().nullable(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional().nullable(),
  allDay: z.boolean().optional(),
  description: z.string().max(5000).optional().nullable(),
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
  const startAfter = query.startAfter as string | undefined;
  const endBefore = query.endBefore as string | undefined;
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
  const skip = (page - 1) * limit;

  const where: any = { userId };
  if (startAfter || endBefore) {
    where.startTime = {};
    if (startAfter) where.startTime.gte = new Date(startAfter);
    if (endBefore) where.startTime.lte = new Date(endBefore);
  }

  const [data, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { startTime: 'asc' },
      include: { reminders: { orderBy: { remindAt: 'asc' } } },
    }),
    prisma.appointment.count({ where }),
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

  const appt = await prisma.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        userId,
        title: body.title,
        location: body.location || null,
        startTime: new Date(body.startTime),
        endTime: body.endTime ? new Date(body.endTime) : null,
        allDay: body.allDay || false,
        description: body.description || null,
      },
      include: { reminders: true },
    });

    for (const r of reminders) {
      const remindAt = new Date(r.remindAt);
      const delay = remindAt.getTime() - Date.now();
      const job = await getQueue().add(
        'reminder',
        { type: 'APPOINTMENT', id: created.id, userId },
        { delay: Math.max(0, delay), jobId: `reminder:appt:${created.id}:${remindAt.toISOString()}` }
      );
      await tx.reminder.create({
        data: {
          type: 'APPOINTMENT',
          appointmentId: created.id,
          remindAt,
          channel: (r.channel as any) || 'PUSH',
          jobId: job.id,
        },
      });
    }
    return created;
  });

  return c.json(appt, 201);
});

app.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const appt = await prisma.appointment.findFirst({
    where: { id, userId },
    include: { reminders: true },
  });
  if (!appt) return c.json({ code: 'NOT_FOUND', message: 'Appointment not found' }, 404);
  return c.json(appt);
});

app.patch('/:id', zValidator('json', updateSchema), async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const existing = await prisma.appointment.findFirst({ where: { id, userId } });
  if (!existing) return c.json({ code: 'NOT_FOUND', message: 'Appointment not found' }, 404);

  const updated = await prisma.$transaction(async (tx) => {
    if (body.reminders) {
      const oldReminders = await tx.reminder.findMany({ where: { appointmentId: id } });
      for (const r of oldReminders) {
        if (r.jobId) await getQueue().remove(r.jobId);
      }
      await tx.reminder.deleteMany({ where: { appointmentId: id } });
      for (const r of body.reminders) {
        const remindAt = new Date(r.remindAt);
        const delay = remindAt.getTime() - Date.now();
        const job = await getQueue().add(
          'reminder',
          { type: 'APPOINTMENT', id, userId },
          { delay: Math.max(0, delay), jobId: `reminder:appt:${id}:${remindAt.toISOString()}` }
        );
        await tx.reminder.create({
          data: { type: 'APPOINTMENT', appointmentId: id, remindAt, channel: (r.channel as any) || 'PUSH', jobId: job.id },
        });
      }
    }
    return tx.appointment.update({
      where: { id },
      data: {
        title: body.title,
        location: body.location,
        startTime: body.startTime ? new Date(body.startTime) : undefined,
        endTime: body.endTime === null ? null : body.endTime ? new Date(body.endTime) : undefined,
        allDay: body.allDay,
        description: body.description,
      },
      include: { reminders: true },
    });
  });

  return c.json(updated);
});

app.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const existing = await prisma.appointment.findFirst({ where: { id, userId } });
  if (!existing) return c.json({ code: 'NOT_FOUND', message: 'Appointment not found' }, 404);
  await prisma.appointment.delete({ where: { id } });
  return c.json({ success: true });
});

export default app;
