# System Assumptions & Design Decisions

This document records all architectural decisions, design assumptions, and default configurations where requirements permit flexibility, ensuring zero ambiguity in production implementation.

---

## 1. Environment & Infrastructure
- **Docker Compose Status**: Docker Desktop is not installed or available on this host environment. Redis 7 (AOF enabled) and PostgreSQL 18 are running natively within WSL Ubuntu. `docker-compose.yml` provides the production container specification, but local tests were executed against the native WSL services. Full Docker container boot was **NOT tested** due to lack of the Docker daemon.
- **Local Fallback / Hybrid Execution**: PostgreSQL 18 is running on port 5433 (WSL). Redis 7 is on port 6379. The system supports both containerized deployment (`docker compose up -d`) and local service connection strings via configurable environment variables in `.env`.
- **Operating System**: Windows host with cross-platform node scripts (`cross-env` where applicable) to guarantee seamless execution on both Windows and Linux/macOS environments.

---

## 1.1 Delivery Guarantees & At-Least-Once Window
- **At-Least-Once Delivery**: If a worker process crashes after an SMTP server accepts an email but before the database transaction updates status to `sent`, BullMQ's retry mechanism or startup reconciler will reprocess the job. The atomic SQL claim (`UPDATE "Email" SET status='processing' WHERE status='scheduled'`) guarantees single active worker execution, but the network gap between SMTP transmission and DB write constitutes an honest at-least-once window. True end-to-end exactly-once delivery across external SMTP boundaries is fundamentally impossible without two-phase commit support from external mail transfer agents.

---

## 2. Phase 1: Database & Seed Assumptions
- **Prisma Schema**:
  - `User`: Supports both Google OAuth identification (`googleId`) and platform attributes.
  - `SlackConnection`: `userId` is unique (1-to-1 relationship with User), storing `teamId`, `accessToken`, `channel`, `webhookUrl`, and `connectedAt`.
  - `Sender`: Represents SMTP credentials. Optional `userId` allows both system-wide shared pool senders and user-scoped senders.
  - `Campaign`: Represents bulk email batches with `userId`, `subject`, `body`, `startTime`, `delayMs`, and `hourlyLimit`.
  - `Email`: Represents individual scheduled sends. Unique constraint on `[campaignId, recipient]`. Compound indexes on `[status, scheduledAt]` and `[userId, status]`.
- **Ethereal Account Seeding**:
  - `npm run seed:senders` generates N test accounts via `nodemailer.createTestAccount()` and persists them in the `Sender` table. Default `SEED_SENDER_COUNT` is 3 if not specified in environment.

---

## 3. Phase 2: Scheduling & Job ID Determinism
- **Recipient Deduplication**: Input emails are deduplicated in memory (normalized to lowercase) prior to chunked insertion into PostgreSQL.
- **Round-Robin Sender Assignment**: Recipients are assigned to available `Sender` accounts using modulo index: `senders[i % senders.length]`.
- **Staggered Scheduling**: `scheduledAt = startTime + (i * delayMs)`.
- **BullMQ Delayed Jobs**:
  - Job ID is strictly set to `emailId` (`jobId: email.id`), guaranteeing BullMQ deduplication and idempotent enqueueing.
  - Delay calculation: `Math.max(0, scheduledAt.getTime() - Date.now())`.
  - Bulk insertion and bulk enqueueing occur in chunks of 500 to handle 5000+ recipients reliably without exhausting memory or socket pools.

---

## 4. Phase 3: Worker & Concurrency Model
- **Worker Process**: Separate entrypoint (`npm run worker`), allowing horizontal scaling of worker processes.
- **Worker Concurrency**: Driven by `WORKER_CONCURRENCY` env (default: 5). BullMQ rate limiter `{ max: 1, duration: MIN_DELAY_BETWEEN_SENDS_MS }` prevents bursts per worker process.
- **Atomic Idempotent Claim**:
  - Worker executes `UPDATE "Email" SET status = 'processing' WHERE id = $1 AND status = 'scheduled' RETURNING *`.
  - If 0 rows are updated, job was already claimed or cancelled and execution terminates cleanly without duplicate dispatch.
- **Deterministic Message-ID**: Derived deterministically as `<${emailId}@outbox.job.scheduler>`.
- **Hourly Rate Limiter**:
  - Redis key `rl:{senderId}:{YYYYMMDDHH}` evaluated via an atomic Lua script executing `INCR` + `EXPIRE` and comparing against the hourly threshold.
  - If rate limit is exceeded, the job is delayed to the next hour window (`nextHourStart + offset`) using `job.moveToDelayed` and throwing `DelayedError`.
- **Slack Alerts**:
  - Limited to once per sender per hour using Redis `SET key 1 EX 3600 NX`.
  - If user has no Slack connection, the alert gracefully skips without halting worker execution.
- **Startup Reconciliation**:
  - On worker boot, queries all emails in `scheduled` or `processing` state.
  - Resets stale `processing` jobs older than 5 minutes to `scheduled`.
  - Checks BullMQ queue and re-adds missing delayed jobs with `jobId = email.id`.

---

## 5. Phase 4: Elasticsearch Eventual Consistency
- Indexing is asynchronous and non-blocking: failures in Elasticsearch are logged and pushed to a best-effort background retry queue or caught, ensuring email sending is never impeded by search indexing hiccups.
- `npm run reindex` allows full hydration of Elasticsearch from PostgreSQL at any time.

---

## 6. Phase 5 & 6: Authentication & UI
- JWT tokens are stored in `httpOnly`, `Secure` (in production), `SameSite=Lax` cookies.
- Frontend App Router interfaces with `/api` proxy routes and typed clients with unified error handling and optimistic UI updates.
