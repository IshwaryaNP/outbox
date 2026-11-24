import { prisma } from '../db/prisma.js';
import { emailQueue } from '../queues/email.queue.js';
import { env } from '../config/env.js';
import type { EmailJobData } from '../types/index.js';

/**
 * Startup Reconciliation (not cron):
 * On worker boot:
 * 1. Resets stale 'processing' jobs older than threshold back to 'scheduled'.
 * 2. Queries all 'scheduled' emails and ensures they exist in BullMQ.
 * 3. Any missing job is re-added with jobId = email.id.
 */
export async function reconcileStartupJobs(staleThresholdMs = env.STALE_PROCESSING_THRESHOLD_MS): Promise<void> {
  console.log(`🔄 [Reconciliation] Running startup job reconciliation (Stale threshold: ${staleThresholdMs}ms)...`);

  const staleCutoff = new Date(Date.now() - staleThresholdMs);

  // 1. Reset stale 'processing' emails older than threshold back to 'scheduled'
  const resetCount = await prisma.email.updateMany({
    where: {
      status: 'processing',
      updatedAt: { lt: staleCutoff },
    },
    data: {
      status: 'scheduled',
    },
  });

  if (resetCount.count > 0) {
    console.log(`[Reconciliation] Reset ${resetCount.count} stale 'processing' emails to 'scheduled'.`);
  }

  // 2. Query all scheduled emails
  const scheduledEmails = await prisma.email.findMany({
    where: { status: 'scheduled' },
    include: { campaign: { select: { subject: true, body: true } } },
  });

  console.log(`[Reconciliation] Found ${scheduledEmails.length} scheduled email(s) in database.`);

  let reEnqueued = 0;
  const now = Date.now();

  for (const email of scheduledEmails) {
    // Check if job exists in BullMQ
    const existingJob = await emailQueue.getJob(email.id);
    let shouldAdd = false;

    if (!existingJob) {
      shouldAdd = true;
    } else {
      const state = await existingJob.getState();
      if (state === 'failed') {
        await existingJob.remove();
        shouldAdd = true;
      }
    }

    if (shouldAdd) {
      const delay = Math.max(0, email.scheduledAt.getTime() - now);
      await emailQueue.add(
        'send-email',
        {
          emailId: email.id,
          campaignId: email.campaignId,
          userId: email.userId,
          senderId: email.senderId,
          recipient: email.recipient,
          subject: email.subject,
          body: email.body,
          scheduledAt: email.scheduledAt.toISOString(),
        } satisfies EmailJobData,
        {
          jobId: email.id,
          delay,
        }
      );
      reEnqueued++;
    }
  }

  console.log(`✅ [Reconciliation] Completed. Re-enqueued ${reEnqueued} missing job(s).`);
}
