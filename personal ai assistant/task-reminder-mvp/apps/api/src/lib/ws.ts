import { WebSocketServer, WebSocket } from 'ws';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret');

const userSockets = new Map<string, Set<WebSocket>>();

export function initWebSocket(server: any) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(1008, 'Missing token');
      return;
    }

    let userId: string;
    try {
      const { payload } = await jwtVerify(token, secret, { clockTolerance: 60 });
      userId = payload.sub as string;
    } catch {
      ws.close(1008, 'Invalid token');
      return;
    }

    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId)!.add(ws);

    ws.send(JSON.stringify({ type: 'connected', payload: { userId }, timestamp: new Date().toISOString() }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', payload: {}, timestamp: new Date().toISOString() }));
        }
      } catch { /* ignore malformed */ }
    });

    ws.on('close', () => {
      userSockets.get(userId)?.delete(ws);
      if (userSockets.get(userId)?.size === 0) userSockets.delete(userId);
    });
  });

  return wss;
}

export function broadcastReminder(userId: string, payload: any) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const message = JSON.stringify({
    type: 'reminder:trigger',
    payload,
    timestamp: new Date().toISOString(),
  });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}

export function broadcastToUser(userId: string, type: string, payload: any) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}
