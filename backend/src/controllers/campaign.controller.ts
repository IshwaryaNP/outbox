import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { emailQueue } from '../queues/email.queue.js';
import { env } from '../config/env.js';
import type { EmailJobData } from '../types/index.js';

const CHUNK_SIZE = 500;

const scheduleCampaignSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(998),
  body: z.string().min(1, 'Body is required'),
  recipients: z
    .array(z.string().email())
    .min(1, 'At least one recipient is required')
    .max(10000, 'Maximum 10,000 recipients per campaign'),
  startTime: z.string().datetime({ message: 'startTime must be a valid ISO datetime' }),
  delayMs: z.coerce.number().int().min(0).max(3_600_000),
  hourlyLimit: z.coerce.number().int().min(1).max(10000),
});

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function scheduleCampaign(req: Request, res: Response): Promise<void> {
  const user = req.user!;

  const parsed = scheduleCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
    return;
  }

  const { subject, body, recipients, startTime, delayMs, hourlyLimit } = parsed.data;

  // 1. Dedupe recipients (normalize lowercase)
  const uniqueRecipients = [...new Set(recipients.map((r) => r.toLowerCase()))];

  // 2. Load available senders (round-robin across all active senders)
  const senders = await prisma.sender.findMany({
    orderBy: { createdAt: 'asc' },
  });
  if (senders.length === 0) {
    res.status(400).json({ error: 'No SMTP senders configured. Run npm run seed:senders first.' });
    return;
  }

  const startDate = new Date(startTime);
  const now = Date.now();

  // 3. Create campaign
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      subject,
      body,
      startTime: startDate,
      delayMs,
      hourlyLimit,
    },
  });

  // 4. Build email rows in memory (chunked inserts into DB)
  const emailRowChunks = chunkArray(uniqueRecipients, CHUNK_SIZE);
  const createdEmailIds: { id: string; scheduledAt: Date; senderId: string; recipient: string }[] = [];

  let recipientIndex = 0;
  for (const chunk of emailRowChunks) {
    const rows = chunk.map((recipient) => {
      const scheduledAt = new Date(startDate.getTime() + recipientIndex * delayMs);
      const sender = senders[recipientIndex % senders.length]!;
      recipientIndex++;
      return {
        campaignId: campaign.id,
        userId: user.id,
        senderId: sender.id,
        recipient,
        subject,
        body,
        scheduledAt,
        status: 'scheduled' as const,
      };
    });

    // Bulk insert with skipDuplicates for idempotency on retry
    await prisma.email.createMany({
      data: rows,
      skipDuplicates: true,
    });

    // Fetch the actual created rows (need IDs for queue)
    const inserted = await prisma.email.findMany({
      where: {
        campaignId: campaign.id,
        recipient: { in: chunk },
      },
      select: { id: true, scheduledAt: true, senderId: true, recipient: true },
    });
    createdEmailIds.push(...inserted);
  }

  // 5. Enqueue BullMQ delayed jobs in chunks
  const jobChunks = chunkArray(createdEmailIds, CHUNK_SIZE);

  for (const chunk of jobChunks) {
    const jobs = chunk.map((email) => {
      const delay = Math.max(0, email.scheduledAt.getTime() - now);
      return {
        name: 'send-email',
        data: {
          emailId: email.id,
          campaignId: campaign.id,
          userId: user.id,
          senderId: email.senderId,
          recipient: email.recipient,
          subject,
          body,
          scheduledAt: email.scheduledAt.toISOString(),
        } satisfies EmailJobData,
        opts: {
          jobId: email.id, // Deduplication: BullMQ won't re-add existing jobId
          delay,
        },
      };
    });

    await emailQueue.addBulk(jobs);
  }

  res.status(201).json({
    campaignId: campaign.id,
    totalRecipients: uniqueRecipients.length,
    deduped: recipients.length - uniqueRecipients.length,
    scheduledCount: createdEmailIds.length,
    startTime: startDate.toISOString(),
    message: `Campaign scheduled. ${createdEmailIds.length} emails enqueued.`,
  });
}
