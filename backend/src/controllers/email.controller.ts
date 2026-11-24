import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { EmailStatus } from '@prisma/client';

const emailQuerySchema = z.object({
  status: z.nativeEnum(EmailStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  campaignId: z.string().uuid().optional(),
});

export async function listEmails(req: Request, res: Response): Promise<void> {
  const user = req.user!;

  const parsed = emailQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query params', details: parsed.error.format() });
    return;
  }

  const { status, page, limit, campaignId } = parsed.data;
  const skip = (page - 1) * limit;

  const where = {
    userId: user.id,
    ...(status ? { status } : {}),
    ...(campaignId ? { campaignId } : {}),
  };

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { scheduledAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        recipient: true,
        subject: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        attempts: true,
        error: true,
        messageId: true,
        previewUrl: true,
        campaignId: true,
        sender: { select: { email: true, smtpHost: true } },
      },
    }),
    prisma.email.count({ where }),
  ]);

  res.json({
    data: emails,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}
