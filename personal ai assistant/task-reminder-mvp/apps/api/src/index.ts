import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { createServer } from 'http';
import auth from './routes/auth.js';
import tasks from './routes/tasks.js';
import appointments from './routes/appointments.js';
import reminders from './routes/reminders.js';
import categories from './routes/categories.js';
import { initWebSocket } from './lib/ws.js';
import { startReminderWorker } from './workers/reminderWorker.js';
import { prisma } from './middleware/auth.js';

const app = new Hono();

app.use('*', cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use('*', logger());

app.get('/health', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    return c.json({ status: 'degraded', db: 'disconnected' }, 503);
  }
});

app.get('/metrics', async (c) => {
  const [userCount, taskCount, apptCount] = await Promise.all([
    prisma.user.count(),
    prisma.task.count(),
    prisma.appointment.count(),
  ]);
  const metrics = [
    `# TaskOverlay Metrics`,
    `users_total ${userCount}`,
    `tasks_total ${taskCount}`,
    `appointments_total ${apptCount}`,
  ].join('\n');
  return c.text(metrics, 200, { 'Content-Type': 'text/plain' });
});

app.route('/api/v1/auth', auth);
app.route('/api/v1/tasks', tasks);
app.route('/api/v1/appointments', appointments);
app.route('/api/v1/reminders', reminders);
app.route('/api/v1/categories', categories);

app.onError((err, c) => {
  console.error(err);
  return c.json({ code: 'INTERNAL_ERROR', message: err.message }, 500);
});

app.notFound((c) => c.json({ code: 'NOT_FOUND', message: 'Endpoint not found' }, 404));

const port = parseInt(process.env.PORT || '4000', 10);
const httpServer = createServer(app.fetch);

initWebSocket(httpServer);
startReminderWorker();

httpServer.listen(port, () => {
  console.log(`🚀 TaskOverlay API running on http://localhost:${port}`);
});
