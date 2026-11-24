import nodemailer from 'nodemailer';
import { prisma } from '../db/prisma.js';

import { env } from '../config/env.js';

interface TransporterCacheItem {
  transporter: nodemailer.Transporter;
  senderEmail: string;
}

const transporterCache = new Map<string, TransporterCacheItem>();

export async function getTransporterForSender(senderId: string): Promise<TransporterCacheItem> {
  const cached = transporterCache.get(senderId);
  if (cached) return cached;

  const sender = await prisma.sender.findUnique({
    where: { id: senderId },
  });

  if (!sender) {
    throw new Error(`Sender not found for id: ${senderId}`);
  }

  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpPort === 465,
    auth: {
      user: sender.smtpUser,
      pass: sender.smtpPass,
    },
    connectionTimeout: env.SMTP_TIMEOUT_MS,
    greetingTimeout: env.SMTP_TIMEOUT_MS,
    socketTimeout: env.SMTP_TIMEOUT_MS,
    tls: {
      rejectUnauthorized: false, // Allow Ethereal self-signed certs in dev
    },
  });

  const item = { transporter, senderEmail: sender.email };
  transporterCache.set(senderId, item);
  return item;
}
