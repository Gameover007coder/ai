const API_BASE = 'http://localhost:4000/api/v1';

async function getToken() {
  const res = await chrome.storage.local.get(['token']);
  return res.token as string | undefined;
}

async function fetchTasks() {
  const token = await getToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE}/tasks?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function render() {
  const app = document.getElementById('app')!;
  const token = await getToken();

  if (!token) {
    app.innerHTML = `
      <div class="login">
        <p style="color:#94a3b8;margin-bottom:12px;">Sign in to see your reminders</p>
        <button class="btn" id="open-dash">Open Dashboard</button>
      </div>
    `;
    document.getElementById('open-dash')!.addEventListener('click', () => {
      chrome.tabs.create({ url: 'http://localhost:3000' });
    });
    return;
  }

  const data = await fetchTasks();
  if (!data) {
    app.innerHTML = `
      <div class="login">
        <p style="color:#94a3b8;">Could not connect to server</p>
      </div>
    `;
    return;
  }

  const tasks = (data.data || []).filter((t: any) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');

  app.innerHTML = `
    <div class="header">
      <h1>TaskOverlay</h1>
      <span style="color:#64748b;font-size:12px;">${tasks.length} pending</span>
    </div>
    <div class="list">
      ${tasks.length === 0
        ? '<div class="empty">All caught up!</div>'
        : tasks.slice(0, 12).map((t: any) => {
            const isOverdue = t.dueDate && new Date(t.dueDate) < new Date();
            const color = isOverdue ? '#ef4444' : '#94a3b8';
            const time = t.dueDate
              ? new Date(t.dueDate).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '';
            return `
              <div class="item">
                <span class="dot" style="background:${color};"></span>
                <span class="title">${t.title}</span>
                ${time ? `<span class="time">${time}</span>` : ''}
              </div>
            `;
          }).join('')
      }
    </div>
    <div class="footer">
      <a href="http://localhost:3000" target="_blank">Open Full Dashboard</a>
    </div>
  `;
}

render();
