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

// --- Middleware ---
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Bull Board (queue monitor UI) ---
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

// Protect Bull Board in non-dev environments with basic auth
if (env.NODE_ENV !== 'development') {
  app.use('/admin/queues', (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
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

// --- 404 handler ---
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// --- Global error handler ---
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start server ---
const server = app.listen(env.PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${env.PORT}`);
  console.log(`📊 Bull Board at http://localhost:${env.PORT}/admin/queues`);
  console.log(`🔧 Environment: ${env.NODE_ENV}`);
  await reconcileStartupJobs();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down...');
  server.close(async () => {
    await emailQueue.close();
    console.log('[Server] Shutdown complete');
    process.exit(0);
  });
});

export { app };
