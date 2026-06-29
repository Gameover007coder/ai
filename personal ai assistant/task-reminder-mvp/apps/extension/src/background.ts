const API_BASE = 'http://localhost:4000/api/v1'; // configurable via storage in prod
const WS_BASE = 'ws://localhost:4000/ws';

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

async function getToken() {
  const res = await chrome.storage.local.get(['token']);
  return res.token as string | undefined;
}

async function fetchTasks() {
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/tasks?limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function updateBadge() {
  const data = await fetchTasks();
  if (!data) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const pending = (data.data || []).filter(
    (t: any) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED'
  );
  const count = pending.length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count > 99 ? '99+' : count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#ef4444' : '#3b82f6' });
}

function connectWs() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  getToken().then((token) => {
    if (!token) return;
    ws = new WebSocket(`${WS_BASE}?token=${token}`);
    ws.onopen = () => {
      console.log('[TaskOverlay BG] WS connected');
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };
    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'reminder:trigger') {
        chrome.notifications.create(`reminder-${Date.now()}`, {
          type: 'basic',
          iconUrl: 'icon-128.png',
          title: 'TaskOverlay Reminder',
          message: msg.payload.title || 'You have a reminder!',
          priority: 2,
        });
        updateBadge();
      }
      if (msg.type === 'connected' || msg.type === 'pong') {
        updateBadge();
      }
    };
    ws.onclose = () => {
      console.log('[TaskOverlay BG] WS closed, reconnecting in 5s...');
      reconnectTimer = setTimeout(connectWs, 5000);
    };
    ws.onerror = (e) => {
      console.error('[TaskOverlay BG] WS error', e);
      ws?.close();
    };
  });
}

// Keep alive via alarms (Manifest V3)
chrome.alarms.onAlarm.addListener(() => {
  connectWs();
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
  connectWs();
  updateBadge();
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
  connectWs();
  updateBadge();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.token) {
    ws?.close();
    connectWs();
    updateBadge();
  }
});

// Badge click: fetch latest
chrome.action.onClicked.addListener(() => {
  updateBadge();
});

connectWs();
updateBadge();
