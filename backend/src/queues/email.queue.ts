import { Queue } from 'bullmq';
import { bullmqConnection } from '../lib/redis.js';
import type { EmailJobData } from '../types/index.js';

export const EMAIL_QUEUE_NAME = 'email-send';

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { age: 86400, count: 1000 }, // Keep 24h or 1000 jobs
    removeOnFail: { age: 7 * 86400 }, // Keep failed 7 days
  },
});

emailQueue.on('error', (err) => {
  console.error('[EmailQueue] Error:', err.message);
});

console.log(`[EmailQueue] Queue "${EMAIL_QUEUE_NAME}" initialized`);
