import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '../middleware/auth.js';
import { broadcastReminder } from '../lib/ws.js';

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export function startReminderWorker(): Worker {
  const worker = new Worker(
    'reminders',
    async (job) => {
      const { type, id, userId } = job.data as { type: string; id: string; userId: string };

      await prisma.reminder.updateMany({
        where: {
          OR: [
            { taskId: id, type: type === 'TASK' ? 'TASK' : undefined },
            { appointmentId: id, type: type === 'APPOINTMENT' ? 'APPOINTMENT' : undefined },
          ],
          sentAt: null,
        },
        data: { sentAt: new Date() },
      });

      let payload: any = { type, id };
      if (type === 'TASK') {
        const task = await prisma.task.findFirst({ where: { id, userId }, include: { category: true } });
        if (task) payload = { ...payload, title: task.title, dueDate: task.dueDate, priority: task.priority, status: task.status };
      } else if (type === 'APPOINTMENT') {
        const appt = await prisma.appointment.findFirst({ where: { id, userId } });
        if (appt) payload = { ...payload, title: appt.title, startTime: appt.startTime, location: appt.location };
      }

      broadcastReminder(userId, payload);
      console.log(`[Reminder Worker] Fired ${type} ${id} for user ${userId}`);
    },
    { connection: redisConnection, concurrency: 50 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Reminder Worker] Job ${job?.id} failed:`, err?.message);
  });

  return worker;
}
