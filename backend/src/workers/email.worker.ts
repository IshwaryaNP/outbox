import { Worker, Job, DelayedError } from 'bullmq';
import nodemailer from 'nodemailer';
import { bullmqConnection } from '../lib/redis.js';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { getTransporterForSender } from '../services/mailer.service.js';
import { checkAndIncrementHourlyRateLimit } from '../services/rate-limiter.service.js';
import { notifySlackOnRateLimit } from '../services/slack.service.js';
import { reconcileStartupJobs } from '../services/reconciler.service.js';
import { EMAIL_QUEUE_NAME } from '../queues/email.queue.js';
import type { EmailJobData } from '../types/index.js';

export function createEmailWorker(): Worker<EmailJobData> {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<EmailJobData>, token?: string) => {
      const { emailId, campaignId, userId, senderId, recipient, subject, body } = job.data;
      console.log(`[Worker] Processing Job ${job.id} -> Recipient: ${recipient}`);

      // 1. ATOMIC IDEMPOTENCY CLAIM
      // UPDATE emails SET status='processing' WHERE id=$1 AND status='scheduled'
      // If 0 rows affected, skip (already handled)
      const claimResult = await prisma.$executeRaw`
        UPDATE "Email"
        SET status = 'processing', "updatedAt" = NOW()
        WHERE id = ${emailId} AND status = 'scheduled'
      `;

      if (claimResult === 0) {
        console.log(`[Worker] Job ${emailId} already claimed or processed. Skipping.`);
        return;
      }

      // Load campaign for rate limit
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { hourlyLimit: true },
      });
      const hourlyLimit = campaign?.hourlyLimit ?? 100;

      // 2. HOURLY RATE LIMIT CHECK via Atomic Lua Script
      const { allowed, nextHourStart } = await checkAndIncrementHourlyRateLimit(
        senderId,
        hourlyLimit
      );

      if (!allowed) {
        console.warn(`[Worker] Hourly limit exceeded for sender ${senderId}. Delaying job ${emailId}`);

        // Compute deterministic offset based on job ID hash to preserve ordering
        const hash = Array.from(emailId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const offsetMs = (hash % 600) * 1000; // spread within 10 minutes
        const delayedUntil = new Date(nextHourStart.getTime() + offsetMs);

        // Status stays 'scheduled', update scheduledAt in DB
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'scheduled',
            scheduledAt: delayedUntil,
          },
        });

        // Trigger Slack alert once per hour per sender
        const { senderEmail } = await getTransporterForSender(senderId);
        await notifySlackOnRateLimit(userId, senderId, senderEmail, hourlyLimit);

        // BullMQ moveToDelayed + throw DelayedError
        if (token) {
          await job.moveToDelayed(delayedUntil.getTime(), token);
          throw new DelayedError();
        }
        return;
      }

      // 3. SEND EMAIL VIA ETHEREAL SMTP
      const deterministicMessageId = `<${emailId}@outbox.job.scheduler>`;

      try {
        const { transporter, senderEmail } = await getTransporterForSender(senderId);

        const info = await transporter.sendMail({
          from: senderEmail,
          to: recipient,
          subject,
          html: body,
          messageId: deterministicMessageId,
          headers: {
            'X-Outbox-Email-Id': emailId,
            'X-Outbox-Campaign-Id': campaignId,
          },
        });

        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`📧 [Worker] Email sent to ${recipient} | ID: ${info.messageId}`);
        if (previewUrl) {
          console.log(`🔗 [Ethereal Preview]: ${previewUrl}`);
        }

        // 4. ATOMIC UPDATE AFTER SUCCESS - Always guarantee non-empty messageId
        const finalMessageId = (info && info.messageId && info.messageId.trim() !== '') 
          ? info.messageId 
          : deterministicMessageId;

        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'sent',
            sentAt: new Date(),
            messageId: finalMessageId,
            error: null,
          },
        });
      } catch (sendError: unknown) {
        const errorMsg = sendError instanceof Error ? sendError.message : 'SMTP delivery error';
        console.error(`❌ [Worker] Failed to send email to ${recipient}:`, errorMsg);

        // Increment attempts
        const updated = await prisma.email.update({
          where: { id: emailId },
          data: {
            attempts: { increment: 1 },
            error: errorMsg,
          },
        });

        // If max attempts reached, mark as failed
        if (updated.attempts >= 5) {
          await prisma.email.update({
            where: { id: emailId },
            data: { status: 'failed' },
          });
        }

        throw sendError; // Triggers BullMQ backoff retry
      }
    },
    {
      connection: bullmqConnection,
      concurrency: env.WORKER_CONCURRENCY,
      limiter: {
        max: 1,
        duration: env.MIN_DELAY_BETWEEN_SENDS_MS,
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Worker] Fatal error:', err.message);
  });

  return worker;
}

// Entry point when executed as standalone worker process
async function main() {
  console.log('🚀 Starting Outbox Worker Process...');
  console.log(`⚙️ Concurrency: ${env.WORKER_CONCURRENCY} | Min Delay: ${env.MIN_DELAY_BETWEEN_SENDS_MS}ms`);

  // Run Startup Reconciliation
  await reconcileStartupJobs();

  const worker = createEmailWorker();

  const shutdown = async () => {
    console.log('[Worker] Graceful shutdown initiated...');
    await worker.close();
    await bullmqConnection.quit();
    await prisma.$disconnect();
    console.log('[Worker] Shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (process.argv[1]?.endsWith('email.worker.ts') || process.argv[1]?.endsWith('email.worker.js')) {
  main().catch((err) => {
    console.error('Worker failed to start:', err);
    process.exit(1);
  });
}
