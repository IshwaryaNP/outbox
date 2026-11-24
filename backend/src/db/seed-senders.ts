import nodemailer from 'nodemailer';
import { prisma } from './prisma.js';
import { env } from '../config/env.js';

export async function seedSenders(count: number = env.SEED_SENDER_COUNT) {
  console.log(`🌱 Seeding ${count} Ethereal SMTP sender accounts...`);

  const createdSenders = [];

  for (let i = 0; i < count; i++) {
    try {
      console.log(`Creating Ethereal account ${i + 1}/${count}...`);
      const testAccount = await nodemailer.createTestAccount();

      const sender = await prisma.sender.upsert({
        where: { email: testAccount.user },
        update: {
          smtpHost: testAccount.smtp.host,
          smtpPort: testAccount.smtp.port,
          smtpUser: testAccount.user,
          smtpPass: testAccount.pass,
        },
        create: {
          email: testAccount.user,
          smtpHost: testAccount.smtp.host,
          smtpPort: testAccount.smtp.port,
          smtpUser: testAccount.user,
          smtpPass: testAccount.pass,
        },
      });

      createdSenders.push(sender);
      console.log(`  ✓ Sender created: ${sender.email} (${sender.smtpHost}:${sender.smtpPort})`);
    } catch (err) {
      console.error(`  ✗ Failed to create test account ${i + 1}:`, err);
      throw err;
    }
  }

  console.log(`✅ Successfully seeded ${createdSenders.length} Ethereal sender accounts.`);
  return createdSenders;
}

if (process.argv[1]?.endsWith('seed-senders.ts') || process.argv[1]?.endsWith('seed-senders.js')) {
  seedSenders()
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
