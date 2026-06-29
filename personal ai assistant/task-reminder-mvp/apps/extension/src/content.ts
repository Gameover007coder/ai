(function () {
  const API_BASE = 'http://localhost:4000/api/v1';
  const WS_BASE = 'ws://localhost:4000/ws';

  // Prevent double-injection
  if ((window as any).__taskOverlayInjected) return;
  (window as any).__taskOverlayInjected = true;

  let token: string | null = null;
  let ws: WebSocket | null = null;
  let widget: HTMLDivElement | null = null;
  let tasks: any[] = [];

  function loadToken() {
    return new Promise<void>((resolve) => {
      chrome.storage.local.get(['token'], (res) => {
        token = res.token || null;
        resolve();
      });
    });
  }

  async function fetchTasks() {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/tasks?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      tasks = data.data || [];
      render();
    } catch {
      // silent
    }
  }

  function connectWs() {
    if (!token || ws) return;
    ws = new WebSocket(`${WS_BASE}?token=${token}`);
    ws.onmessage = () => fetchTasks();
    ws.onclose = () => {
      ws = null;
      setTimeout(connectWs, 5000);
    };
  }

  function createWidget() {
    widget = document.createElement('div');
    widget.id = 'taskoverlay-widget';
    widget.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 2147483646;
      font-family: system-ui, -apple-system, sans-serif; font-size: 13px; line-height: 1.4;
      user-select: none; -webkit-user-select: none;
    `;
    document.body.appendChild(widget);
    render();
  }

  function getUrgency() {
    const pending = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
    const overdue = pending.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date());
    if (overdue.length > 0) return { color: '#ef4444', text: String(overdue.length) };
    const today = pending.filter((t: any) => {
      if (!t.dueDate) return false;
      return new Date(t.dueDate).toDateString() === new Date().toDateString();
    });
    if (today.length > 0) return { color: '#f59e0b', text: String(today.length) };
    if (pending.length > 0) return { color: '#6366f1', text: String(pending.length) };
    return { color: '#6366f1', text: '' };
  }

  function render() {
    if (!widget) return;
    const pending = tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');
    const urgency = getUrgency();
    const isExpanded = widget.getAttribute('data-expanded') === 'true';

    widget.innerHTML = `
      <div id="to-panel" style="
        display: ${isExpanded ? 'block' : 'none'};
        background: rgba(15,23,42,0.95); border: 1px solid #334155;
        border-radius: 12px; width: 260px; max-height: 300px; overflow-y: auto;
        margin-bottom: 10px; padding: 10px; color: #e2e8f0; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        backdrop-filter: blur(8px);
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-weight:600;font-size:12px;">Upcoming</span>
          <button id="to-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;">&times;</button>
        </div>
        ${pending.length === 0
          ? '<div style="color:#64748b;font-size:12px;text-align:center;padding:12px;">All caught up!</div>'
          : pending.slice(0, 8).map((t: any) => {
              const isOverdue = t.dueDate && new Date(t.dueDate) < new Date();
              const time = t.dueDate
                ? new Date(t.dueDate).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                : '';
              return `
                <div style="
                  display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:8px;
                  margin-bottom:4px; font-size:12px; ${isOverdue ? 'background:rgba(239,68,68,0.15);' : 'background:rgba(51,65,85,0.4);'}
                ">
                  <span style="width:6px;height:6px;border-radius:50%;background:${isOverdue ? '#ef4444' : '#94a3b8'};flex-shrink:0;"></span>
                  <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.title}</span>
                  ${time ? `<span style="color:#64748b;flex-shrink:0;font-size:11px;">${time}</span>` : ''}
                </div>
              `;
            }).join('')
        }
        <a href="http://localhost:3000" target="_blank" style="display:block;text-align:center;color:#818cf8;font-size:11px;margin-top:6px;text-decoration:none;">
          Open Dashboard
        </a>
      </div>
      <div id="to-btn" style="
        width: 48px; height: 48px; border-radius: 50%; background: ${urgency.color};
        display: flex; align-items: center; justify-content: center; cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4); transition: transform 0.15s; color: white;
        font-weight: 700; font-size: 14px; position: relative; margin-left: auto;
      ">
        ${urgency.text ? `<span>${urgency.text}</span>` : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`}
      </div>
    `;

    widget.querySelector('#to-btn')!.addEventListener('click', () => {
      widget!.setAttribute('data-expanded', isExpanded ? 'false' : 'true');
      render();
    });
    widget.querySelector('#to-close')?.addEventListener('click', () => {
      widget!.setAttribute('data-expanded', 'false');
      render();
    });
  }

  async function init() {
    await loadToken();
    if (!token) return;
    createWidget();
    fetchTasks();
    connectWs();
    // refresh every 60s
    setInterval(fetchTasks, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
