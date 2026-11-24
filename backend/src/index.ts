import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { emailQueue } from './queues/email.queue.js';
import { reconcileStartupJobs } from './services/reconciler.service.js';

const app = express();

// --- CORS: support comma-separated FRONTEND_URL list ---
const allowedOrigins = env.FRONTEND_URL
  ? env.FRONTEND_URL.split(',').map((o) => o.trim())
  : ['http://localhost:3000'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow non-browser clients
      if (allowedOrigins.some((o) => origin === o || origin.endsWith('.vercel.app')))
        return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Bull Board ---
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

// Protect Bull Board in production with basic auth
if (env.NODE_ENV !== 'development') {
  app.use('/admin/queues', (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="Admin"');
      res.status(401).send('Unauthorized');
      return;
    }
    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString('ascii');
    const [, password] = credentials.split(':');
    const expectedPassword = env.BULL_BOARD_PASSWORD || 'admin';
    if (password !== expectedPassword) {
      res.set('WWW-Authenticate', 'Basic realm="Admin"');
      res.status(401).send('Unauthorized');
      return;
    }
    next();
  });
}

app.use('/admin/queues', serverAdapter.getRouter());

// --- API Routes ---
app.use('/api', apiRoutes);

// --- 404 ---
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// --- Global error handler ---
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start server ---
const server = app.listen(env.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${env.PORT}`);
  console.log(`📊 Bull Board at http://localhost:${env.PORT}/admin/queues`);
  console.log(`🔧 Environment: ${env.NODE_ENV}`);
  // Run reconciliation in background — don't block startup
  reconcileStartupJobs().catch((err) => {
    console.error('[Reconciliation] Startup reconciliation failed (non-fatal):', err.message);
  });
});

// --- Graceful shutdown ---
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down...');
  server.close(async () => {
    await emailQueue.close();
    console.log('[Server] Shutdown complete');
    process.exit(0);
  });
});

// Catch unhandled promise rejections — log but don't crash
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection (non-fatal):', reason);
});

export { app };
