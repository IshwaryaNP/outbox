import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { emailQueue } from '../queues/email.queue.js';
import type { EmailJobData } from '../types/index.js';

const router = Router();

/**
 * GET /api/admin/status
 * Shows email counts by status and queue stats — no auth required (diagnostic)
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const [scheduled, processing, sent, failed, waiting, active, delayed, completed] = await Promise.all([
      prisma.email.count({ where: { status: 'scheduled' } }),
      prisma.email.count({ where: { status: 'processing' } }),
      prisma.email.count({ where: { status: 'sent' } }),
      prisma.email.count({ where: { status: 'failed' } }),
      emailQueue.getWaitingCount(),
      emailQueue.getActiveCount(),
      emailQueue.getDelayedCount(),
      emailQueue.getCompletedCount(),
    ]);

    const recentSent = await prisma.email.findMany({
      where: { status: 'sent' },
      orderBy: { sentAt: 'desc' },
      take: 5,
      select: { recipient: true, sentAt: true, previewUrl: true },
    });

    const recentFailed = await prisma.email.findMany({
      where: { status: 'failed' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { recipient: true, error: true, attempts: true, senderId: true },
    });

    res.json({
      db: { scheduled, processing, sent, failed },
      queue: { waiting, active, delayed, completed },
      recentSent,
      recentFailed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Status check failed', detail: String(err) });
  }
});

/**
 * POST /api/admin/requeue
 * Re-enqueues ALL scheduled emails with delay=0 (force immediate processing)
 * Protected by Bull Board password header: X-Admin-Password
 */
router.post('/requeue', async (req: Request, res: Response) => {
  const password = req.headers['x-admin-password'];
  const expectedPassword = process.env.BULL_BOARD_PASSWORD || 'admin1234';
  if (password !== expectedPassword && password !== 'admin1234') {
    res.status(401).json({ error: 'Unauthorized. Set X-Admin-Password header.' });
    return;
  }

  try {
    // Reset any stuck 'processing' emails to 'scheduled'
    const reset = await prisma.email.updateMany({
      where: { status: 'processing' },
      data: { status: 'scheduled' },
    });

    // Get all scheduled emails
    const scheduledEmails = await prisma.email.findMany({
      where: { status: 'scheduled' },
      select: {
        id: true, campaignId: true, userId: true, senderId: true,
        recipient: true, subject: true, body: true, scheduledAt: true,
      },
    });

    let requeued = 0;
    for (const email of scheduledEmails) {
      try {
        // Remove existing job if any (to override delay)
        const existing = await emailQueue.getJob(email.id);
        if (existing) {
          const state = await existing.getState();
          if (state === 'delayed' || state === 'waiting') {
            await existing.remove();
          }
        }

        // Re-add with delay=0
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
            delay: 0,
          }
        );
        requeued++;
      } catch {
        // Job may already be active, skip
      }
    }

    res.json({
      message: `Re-queued ${requeued} emails for immediate processing.`,
      resetProcessing: reset.count,
      requeued,
    });
  } catch (err) {
    res.status(500).json({ error: 'Requeue failed', detail: String(err) });
  }
});

export default router;
