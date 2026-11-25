# 📬 Outbox — Distributed Email Job Scheduler

A production-grade **email campaign scheduler** built with Next.js, Express, BullMQ, Prisma, and PostgreSQL. Schedule bulk email campaigns with rate limiting, deduplication, and real-time job tracking.

---

## 🚀 Live Demo

| Service | URL |
|---------|-----|
| **Frontend (Vercel)** | https://outbox-dzt8.vercel.app |
| **Backend API (Railway)** | https://wholesome-quietude-production.up.railway.app |
| **Bull Board (Queue Monitor)** | https://wholesome-quietude-production.up.railway.app/admin/queues |

**1-Click Demo Login:** Click **⚡ Demo / Evaluator Sign In** on the login page — no account needed.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│            Next.js 15 · React · Tailwind CSS               │
│              Hosted on Vercel                               │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTPS API calls (Bearer token)
┌──────────────────▼──────────────────────────────────────────┐
│                     BACKEND API                             │
│          Express.js · JWT Auth · REST API                   │
│              Hosted on Railway                              │
│                                                             │
│   ┌──────────────┐    ┌──────────────┐    ┌─────────────┐  │
│   │   Prisma ORM │    │   BullMQ     │    │  Bull Board │  │
│   │  PostgreSQL  │    │  Job Queue   │    │  Dashboard  │  │
│   └──────────────┘    └──────┬───────┘    └─────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │ Jobs via Redis
┌──────────────────────────────▼──────────────────────────────┐
│                   EMAIL WORKER SERVICE                       │
│         BullMQ Worker · Nodemailer · Railway                 │
│                                                             │
│  - Atomic idempotency claim (UPDATE WHERE status=scheduled) │
│  - Hourly rate limiting per sender (Lua atomic script)      │
│  - Exponential backoff retry (5 attempts)                   │
│  - Startup reconciliation (re-enqueues missed jobs)         │
└─────────────────────────────────────────────────────────────┘
         │                                      │
   ┌─────▼──────┐                      ┌────────▼────────┐
   │ PostgreSQL  │                      │  Redis (BullMQ) │
   │  (Railway)  │                      │   (Railway)     │
   └────────────┘                      └─────────────────┘
```

---

## ✨ Features

| Feature | Implementation |
|---------|---------------|
| **1-Click Demo Login** | `POST /api/auth/demo` — instant JWT, no signup |
| **Google OAuth 2.0** | Full PKCE flow with CSRF state validation |
| **Bulk Email Scheduling** | Upload CSV/TXT → campaigns with delay between sends |
| **BullMQ Delayed Jobs** | Each email is a delayed job with exact `scheduledAt` |
| **Atomic Idempotency** | `UPDATE WHERE status='scheduled'` prevents double-send |
| **Hourly Rate Limiting** | Redis Lua script enforces per-sender hourly cap |
| **Startup Reconciliation** | Worker re-enqueues missing jobs on boot |
| **Bull Board** | Real-time queue dashboard at `/admin/queues` |
| **Deduplication** | Same recipient in one campaign is skipped |
| **Sent Tab** | Shows all processed emails with timestamps |
| **Summary Stats** | Live counts of Queued / Sent / Failed |
| **Slack Integration** | OAuth connect, rate-limit alerts |
| **Cross-domain Auth** | Bearer token fallback for Vercel ↔ Railway |

---

## 🛠️ Tech Stack

**Frontend:**
- Next.js 15 (App Router)
- React 18 + TypeScript
- Tailwind CSS
- Lucide React icons
- Deployed on **Vercel**

**Backend:**
- Node.js + Express.js + TypeScript
- Prisma ORM (PostgreSQL)
- BullMQ (Redis-backed job queue)
- Nodemailer (SMTP email delivery)
- JSON Web Tokens (JWT)
- Zod (validation)
- Deployed on **Railway**

**Infrastructure:**
- PostgreSQL (Railway managed)
- Redis (Railway managed)
- GitHub → auto-deploy to Vercel + Railway

---

## ⚙️ Setup Instructions

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Redis 7+

### 1. Clone the repository
```bash
git clone https://github.com/IshwaryaNP/outbox.git
cd outbox
```

### 2. Backend setup
```bash
cd backend
cp .env.example .env
# Fill in your env vars (see below)
npm install
npx prisma db push
npm run seed:senders   # Seeds 3 Ethereal SMTP senders
npm run dev            # API on http://localhost:4000
```

### 3. Worker setup (separate terminal)
```bash
cd backend
npm run worker         # BullMQ worker process
```

### 4. Frontend setup
```bash
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev            # App on http://localhost:3000
```

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/outbox

# Redis
REDIS_URL=redis://:password@host:6379

# Auth
JWT_SECRET=your-32-char-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback

# App
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
BULL_BOARD_PASSWORD=admin1234

# Worker
WORKER_CONCURRENCY=5
MIN_DELAY_BETWEEN_SENDS_MS=200
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/google` | Initiate Google OAuth |
| `GET` | `/api/auth/google/callback` | OAuth callback |
| `POST` | `/api/auth/demo` | 1-click demo login → `{ token, user }` |
| `GET` | `/api/auth/me` | Get current user (requires auth) |
| `POST` | `/api/auth/logout` | Clear session |

### Campaigns
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/campaigns/schedule` | Schedule email campaign |

### Emails
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/emails?status=scheduled` | List queued emails |
| `GET` | `/api/emails?status=sent` | List sent emails |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/status` | DB + queue counts |
| `POST` | `/api/admin/requeue` | Force re-process all scheduled emails |

---

## 🔄 How Email Scheduling Works

1. **User uploads CSV** with recipient emails and sets subject/body/delay/schedule time.
2. **API creates** `Campaign` and `Email` rows in PostgreSQL (`status='scheduled'`).
3. **BullMQ delayed jobs** are enqueued — one per recipient, with `delay = scheduledAt - now`.
4. **Worker picks up** each job when its delay expires.
5. **Atomic claim**: `UPDATE Email SET status='processing' WHERE id=? AND status='scheduled'` — prevents double-send.
6. **Hourly rate limit** checked via Redis Lua script per sender.
7. **Email sent** via SMTP (Nodemailer). On success: `status='sent'`, `previewUrl` saved.
8. **Frontend polls** every 5 seconds and shows live Sent count.

---

## 📂 Project Structure

```
outbox/
├── frontend/                   # Next.js 15 app
│   ├── src/app/
│   │   ├── login/page.tsx      # Login page (Google OAuth + Demo)
│   │   └── page.tsx            # Main dashboard
│   └── next.config.js          # API proxy rewrites
│
├── backend/                    # Express API + BullMQ worker
│   ├── src/
│   │   ├── config/env.ts       # Zod-validated env vars
│   │   ├── controllers/        # Auth, campaigns, emails, Slack
│   │   ├── middleware/         # JWT auth middleware
│   │   ├── queues/             # BullMQ queue setup
│   │   ├── routes/             # Express routers
│   │   ├── services/           # Mailer, rate limiter, Slack, reconciler
│   │   ├── workers/            # email.worker.ts (standalone process)
│   │   └── index.ts            # Express app + Bull Board
│   ├── prisma/schema.prisma    # DB schema
│   ├── railway.toml            # API service Railway config
│   └── railway.worker.toml     # Worker service Railway config
│
└── README.md
```

---

## 🌐 Deployment

### Vercel (Frontend)
- Root Directory: `frontend`
- Env var: `NEXT_PUBLIC_API_URL=https://wholesome-quietude-production.up.railway.app`

### Railway (Backend + Worker)
Two separate services from the same repo:
- **`wholesome-quietude`** (API): start command `npx prisma migrate deploy && npm run start`
- **`outbox`** (Worker): start command `npm run worker:prod`

Both share the same PostgreSQL and Redis add-ons.

---

## 👥 GitHub Collaborators

This repository has been shared with:
- `mitrajit`
- `Yadav036`
