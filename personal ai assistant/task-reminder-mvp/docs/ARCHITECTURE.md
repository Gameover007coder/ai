# Task Reminder MVP — System Architecture

> **Vision**: A free, unlimited task & appointment reminder app that overlays small icons on your screen (desktop browser via extension, mobile via PWA) so you never miss what matters.
> **Scale Target**: 1M+ users, 10M+ tasks, sub-100ms API p99.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │   Web App    │  │  Browser Ext │  │   PWA (Mobile)│  │  Desktop App│  │
│  │  (React+Vite)│  │ (Manifest V3)│  │  (React+Vite) │  │  (Electron) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  │
│         │                  │                  │                  │        │
│         └──────────────────┴──────────────────┘──────────────────┘        │
│                                 │                                        │
│                         ┌───────┴───────┐                                │
│                         │   WebSocket   │  (Real-time reminders)         │
│                         └───────┬───────┘                                │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  │
┌─────────────────────────────────┼───────────────────────────────────────┐
│                         API GATEWAY / CDN                               │
│                     (Cloudflare / Nginx / Vercel Edge)                    │
│                         Rate Limit │ Auth │ Cache                         │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  │
┌─────────────────────────────────┼───────────────────────────────────────┐
│                            BACKEND LAYER                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    API Server (Hono/Node.js)                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │   │
│  │  │   Auth   │ │  Tasks   │ │ Calendar │ │  Push    │          │   │
│  │  │  Service │ │  Service │ │  Service │ │ Service  │          │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘          │   │
│  │       └─────────────┴────────────┴──────────┘                  │   │
│  │                         │                                      │   │
│  │              ┌──────────┴──────────┐                         │   │
│  │              │    Event Bus (Redis)   │                         │   │
│  │              └──────────┬──────────┘                         │   │
│  └─────────────────────────┼───────────────────────────────────┘   │
└──────────────────────────┼───────────────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────────────┐
│                       DATA & INFRA LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │  PostgreSQL  │  │    Redis     │  │  S3 / R2     │  │  BullMQ  │  │
│  │  (Primary)   │  │  (Cache/WS)  │  │  (Assets)    │  │ (Queue)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Design Principles

1. **Monolith-first, services-later**: All business logic lives in one API server but is modularized internally so horizontal scaling is trivial.
2. **Stateless API**: JWT auth, no server-side sessions. Any pod can handle any request.
3. **Edge caching**: Static assets served via CDN. API responses cacheable via Redis.
4. **Event-driven reminders**: Redis BullMQ handles reminder scheduling at scale. When a reminder fires, it pushes via WebSocket + Web Push.
5. **Database per tenant (future)**: Schema designed with `tenant_id` (org_id) for future sharding.

---

## 3. File Structure (Monorepo)

```
task-reminder-mvp/
├── apps/
│   ├── web/                  # React + Vite PWA Dashboard
│   ├── extension/            # Chrome/Firefox Extension (Manifest V3)
│   └── desktop/              # Electron wrapper (optional, Phase 2)
├── packages/
│   ├── database/             # Prisma schema + client + migrations
│   ├── shared/               # Shared TypeScript types & utilities
│   └── ui/                   # Shared UI component library (React)
├── infra/
│   ├── docker/
│   ├── k8s/                  # Kubernetes manifests (future)
│   └── terraform/            # IaC (future)
├── docs/
│   └── ARCHITECTURE.md
├── package.json              # Root (pnpm workspace)
├── turbo.json                # Build orchestration
└── README.md
```

---

## 4. Database Schema (PostgreSQL + Prisma)

### 4.1 Users & Auth
```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String?   // Nullable for OAuth-only users
  name          String?
  avatar        String?
  timezone      String    @default("UTC")
  pushToken     String?   // Web Push VAPID subscription
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  tasks         Task[]
  appointments  Appointment[]
  categories    Category[]
}
```

### 4.2 Tasks & Appointments (Unified Reminder Model)
```prisma
model Task {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String
  description String?
  dueDate     DateTime?
  priority    Priority  @default(MEDIUM)
  status      Status    @default(PENDING)
  categoryId  String?
  category    Category? @relation(fields: [categoryId], references: [id])
  reminders   Reminder[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([userId, status, dueDate])
  @@index([dueDate])
}

model Appointment {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String
  location    String?
  startTime   DateTime
  endTime     DateTime?
  allDay      Boolean   @default(false)
  description String?
  reminders   Reminder[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([userId, startTime])
  @@index([startTime])
}

model Reminder {
  id            String    @id @default(cuid())
  type          ReminderType
  taskId        String?
  task          Task?     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  appointmentId String?
  appointment   Appointment? @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  remindAt      DateTime
  sentAt        DateTime?
  channel       Channel   @default(PUSH)
  createdAt     DateTime  @default(now())

  @@index([remindAt, sentAt])  // Critical for the reminder worker
}

model Category {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  name   String
  color  String @default("#3b82f6")
  tasks  Task[]
}
```

---

## 5. API Endpoints (REST + WebSocket)

### Auth (`/api/v1/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Email + password |
| POST | `/login` | Returns JWT access + refresh |
| POST | `/refresh` | Rotate access token |
| POST | `/logout` | Invalidate refresh token |

### Tasks (`/api/v1/tasks`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List (filter: status, dueDate, priority) |
| POST | `/` | Create task + optional reminders |
| GET | `/:id` | Get single task |
| PATCH | `/:id` | Update task |
| DELETE | `/:id` | Delete task |
| POST | `/:id/complete` | Mark complete |

### Appointments (`/api/v1/appointments`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List (filter: date range) |
| POST | `/` | Create appointment + reminders |
| GET | `/:id` | Get single |
| PATCH | `/:id` | Update |
| DELETE | `/:id` | Delete |

### Reminders (`/api/v1/reminders`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/upcoming` | Next 24h reminders |
| POST | `/` | Create custom reminder |
| DELETE | `/:id` | Cancel reminder |

### WebSocket (`/ws`)
- Auth via JWT query param: `?token=xxx`
- Events: `reminder:trigger`, `task:update`, `appointment:update`
- Used for real-time overlay notifications on active sessions

---

## 6. UI Architecture

### 6.1 Web Dashboard (React + Vite)
- **State**: Zustand (lightweight, no boilerplate)
- **Query**: TanStack Query (React Query) for server state
- **Routing**: TanStack Router
- **Styling**: Tailwind CSS + Headless UI
- **Icons**: Lucide React
- **PWA**: `vite-plugin-pwa` with service worker for offline + push
- **Calendar**: Custom lightweight calendar component (no heavy deps)

### 6.2 Browser Extension (Manifest V3)
- **Content Script**: Injects a small floating widget (bottom-right, 48x48px icon) on every page
- **Popup**: Click icon → full task list mini-view
- **Background Service Worker**: Listens for WebSocket or push events, updates badge count
- **Permissions**: `activeTab`, `storage`, `notifications`
- **Widget Design**: 
  - Small circular icon with task count badge
  - Expand on hover → mini task list
  - Color-coded by urgency (red = overdue, yellow = today, green = future)

### 6.3 Mobile (PWA)
- Installable from web
- Push notifications via Web Push API
- Standalone mode feels like native app

---

## 7. Scalability & Production Readiness

### 7.1 Horizontal Scaling
- API is fully stateless. Run behind a load balancer with N pods.
- WebSocket uses Redis Pub/Sub adapter so any pod can broadcast to any client.
- Database read replicas for GET-heavy endpoints.

### 7.2 Reminder Engine (The Hard Part)
- **Problem**: At 1M users, we can't poll the DB every second.
- **Solution**: Redis BullMQ job queue.
  - When a task/appointment is created with a reminder, schedule a BullMQ job with `delay = remindAt - now`.
  - Worker processes fire at the right time, queries DB for recipient details, then pushes via WebSocket + Web Push.
  - If a reminder is updated/deleted, remove the old job and schedule a new one.
- **Edge case**: Server restarts → BullMQ persists jobs in Redis, so no missed reminders.
- **Future**: At massive scale, move to a dedicated "Chron" service that only does scheduling.

### 7.3 Security
- JWT access tokens (15m expiry) + refresh tokens (7d) stored in httpOnly cookies
- Bcrypt password hashing (cost 12)
- CORS restricted to known origins
- Rate limiting: 100 req/min per IP, 1000 req/min per user
- Input validation via Zod on every endpoint
- SQL injection impossible via Prisma parameterized queries
- XSS prevention via Content Security Policy headers

### 7.4 Observability
- Structured logging via Pino
- Health check endpoint `/health` (DB + Redis connectivity)
- Metrics endpoint `/metrics` (Prometheus format) — user count, task count, WS connections, reminder latency
- Future: OpenTelemetry tracing, Sentry error tracking

### 7.5 Deployment
- **Containerization**: Docker + Docker Compose for local; `Dockerfile` optimized for multi-stage build
- **CI/CD**: GitHub Actions (lint → test → build → push to registry)
- **Hosting**: 
  - API: Railway / Render / Fly.io (Docker)
  - DB: Supabase PostgreSQL / AWS RDS
  - Redis: Upstash Redis / Redis Cloud
  - Static: Cloudflare Pages / Vercel
- **Future**: Kubernetes (EKS/GKE) with auto-scaling HPA

---

## 8. Cost Model (Free Forever MVP)

| Component | Free Tier Option | Limit |
|-----------|-----------------|-------|
| API Hosting | Render / Railway / Fly.io | Generous free tiers |
| Database | Supabase / Neon | 500MB-1GB free |
| Redis | Upstash | 10k req/day free |
| Static Hosting | Cloudflare Pages | Unlimited free |
| Push Notifications | Web Push API (browser-native) | Free, no SMS/email cost |
| CDN | Cloudflare | Unlimited free |

**Strategy**: Use browser-native Web Push instead of Twilio/SendGrid for notifications. Zero per-user cost.

---

## 9. Roadmap

1. **MVP (Week 1-2)**: Web dashboard + API + basic PWA + extension widget
2. **Alpha (Week 3-4)**: WebSocket real-time, offline support, recurring tasks
3. **Beta (Week 5-6)**: Desktop Electron app, native-feel mobile, calendar sync (Google/Outlook)
4. **Scale (Month 2+)**: K8s, read replicas, dedicated reminder service, multi-region

---

*Architecture v1.0 — Designed for scale from day one.*
