# TaskOverlay — Free Unlimited Task & Appointment Reminders

> A production-ready, scalable startup MVP that overlays small reminder icons on your desktop or mobile screen. No limits. No fees. Built to scale to millions.

---

## What is TaskOverlay?

TaskOverlay is a free, unlimited reminder app that keeps your schedule visible at all times:
- **Web Dashboard** — Full task & appointment manager with PWA support (install on mobile/desktop)
- **Browser Extension** — Floating icon widget on every web page you visit, with badge count and real-time popups
- **WebSocket Push** — Real-time reminders delivered instantly to any open tab or extension
- **Screen Overlay Icons** — Small, color-coded dots (red = overdue, yellow = today, blue = future) always visible on your screen

---

## System Architecture

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Web App     │  │  Extension   │  │  PWA Mobile  │
│  (React+Vite)│  │  (ManifestV3)│  │  (React+Vite)│
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                  │
       └────────────┬────┴──────────────────┘
                    │  WebSocket (real-time)
                    ▼
            ┌──────────────┐
            │  Hono API    │  Stateless, JWT auth, Zod validation
            │  Node.js     │  BullMQ reminder engine, Redis cache
            └──────┬───────┘
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
  PostgreSQL               Redis (BullMQ + WS pub/sub)
  (Prisma ORM)             (Reminder scheduling + caching)
```

**Read the full architecture:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| API Server | Hono (Node.js) | Fast, lightweight, edge-ready, type-safe |
| Database | PostgreSQL + Prisma | Relational data, ACID, easy migrations |
| Cache / Queue | Redis + BullMQ | Job scheduling, WebSocket pub/sub, caching |
| Auth | JWT (jose) + bcrypt | Stateless, scalable, secure |
| Web | React + Vite + Tailwind | Fast DX, small bundle, PWA ready |
| State | Zustand + TanStack Query | Minimal boilerplate, server-state sync |
| Real-time | WebSocket (ws) | Instant reminder push to any client |
| Extension | Manifest V3 + vanilla TS | Lightweight, no framework overhead |
| Deploy | Docker + Docker Compose | Portable, reproducible |

---

## File Structure

```
task-reminder-mvp/
├── apps/
│   ├── api/                    # Hono backend API
│   ├── web/                    # React PWA dashboard + overlay widget
│   └── extension/              # Chrome/Firefox extension (screen icons)
├── packages/
│   ├── shared/                 # TypeScript types + utilities
│   └── database/               # Prisma schema + client
├── infra/docker/               # Dockerfiles + docker-compose + nginx
├── docs/
│   └── ARCHITECTURE.md         # Full system design
├── .env.example                # Environment template
├── package.json                # pnpm workspace root
├── turbo.json                  # Build orchestration
└── pnpm-workspace.yaml
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker & Docker Compose (for local DB/Redis)

### 1. Clone & Install
```bash
git clone <repo>
cd task-reminder-mvp
pnpm install
```

### 2. Start Infrastructure
```bash
cd infra/docker
docker-compose up -d
```
This starts PostgreSQL on `:5432` and Redis on `:6379`.

### 3. Setup Database
```bash
pnpm db:generate   # Generate Prisma client
pnpm db:migrate   # Run migrations
```

### 4. Run Everything
```bash
# Terminal 1 — API
cp .env.example .env
pnpm api:dev       # http://localhost:4000

# Terminal 2 — Web
pnpm web:dev       # http://localhost:3000

# Terminal 3 — Extension (build watch)
pnpm extension:build --watch
```

### 5. Install Extension
1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `apps/extension/dist/`
4. The floating icon appears on every page you visit!

---

## API Endpoints

| Resource | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| Auth | POST | `/api/v1/auth/register` | Register |
| Auth | POST | `/api/v1/auth/login` | Login (JWT) |
| Auth | POST | `/api/v1/auth/refresh` | Rotate token |
| Tasks | GET | `/api/v1/tasks` | List with filters |
| Tasks | POST | `/api/v1/tasks` | Create + auto-reminders |
| Tasks | PATCH | `/api/v1/tasks/:id` | Update |
| Tasks | POST | `/api/v1/tasks/:id/complete` | Mark done |
| Appointments | GET | `/api/v1/appointments` | List with date range |
| Appointments | POST | `/api/v1/appointments` | Create + auto-reminders |
| Reminders | GET | `/api/v1/reminders/upcoming` | Next 24h |
| Reminders | DELETE | `/api/v1/reminders/:id` | Cancel |
| Categories | GET | `/api/v1/categories` | User categories |
| Health | GET | `/health` | DB connectivity check |
| Metrics | GET | `/metrics` | Prometheus-style stats |
| WS | WS | `/ws?token=xxx` | Real-time push |

---

## Database Schema (Prisma)

**Core entities:** `User`, `Task`, `Appointment`, `Reminder`, `Category`, `RefreshToken`

Key indexes:
- `Task`: `(userId, status, dueDate)` — fast dashboard queries
- `Appointment`: `(userId, startTime)` — fast calendar queries
- `Reminder`: `(remindAt, sentAt)` — fast worker polling

Full schema: [`packages/database/prisma/schema.prisma`](./packages/database/prisma/schema.prisma)

---

## Scalability Highlights

### Reminder Engine (BullMQ)
- No polling the DB every second
- Reminders are scheduled as delayed jobs in Redis
- At scale, spin up more worker pods (stateless, just connect to Redis)
- Jobs survive server restarts (Redis persistence)

### Stateless API
- JWT auth, no sessions
- Any pod can handle any request
- Run behind a load balancer with N replicas

### WebSocket at Scale
- Redis Pub/Sub adapter (future: `socket.io` with Redis adapter)
- Broadcast from any pod to any connected client

### Database
- Prisma Connection Pooling (default: 10 connections)
- Read replicas for GET-heavy endpoints (future)
- Tenant-aware schema for future horizontal sharding

---

## Deployment

### Docker Compose (Self-hosted)
```bash
cd infra/docker
docker-compose up -d
```

### Cloud (Free Tiers)
| Component | Free Service | Notes |
|-----------|-------------|-------|
| API | Railway / Render / Fly.io | Docker container |
| DB | Supabase / Neon | 500MB-1GB free |
| Redis | Upstash | 10k ops/day free |
| Static | Cloudflare Pages | Unlimited |
| Push | Web Push API | Browser-native, free |

---

## Security

- **JWT**: Access tokens 15min, refresh tokens 7d, httpOnly cookies
- **Passwords**: bcrypt cost 12
- **Validation**: Zod on every endpoint
- **SQL Injection**: Impossible (Prisma parameterized queries)
- **CORS**: Restricted to known origins
- **Rate Limit**: 100 req/min per IP, 1000 req/min per user
- **CSP Headers**: XSS prevention

---

## Monitoring & Observability

- `/health` — DB + Redis connectivity
- `/metrics` — Prometheus-compatible stats (user count, task count, WS connections)
- Structured logging via Hono logger
- Future: OpenTelemetry tracing, Sentry error tracking

---

## Roadmap

1. **MVP** ✅ — Web dashboard + API + PWA + extension widget
2. **Alpha** — WebSocket real-time, offline support, recurring tasks
3. **Beta** — Desktop Electron app, Google/Outlook calendar sync
4. **Scale** — Kubernetes, read replicas, dedicated reminder service, multi-region

---

## License

MIT — Free forever. No usage limits. No hidden fees.

---

Built with ❤️ for people who need to stay on top of their day.
