import { Queue } from 'bullmq';
import { bullmqConnection } from '../src/lib/redis.js';
import { prisma } from '../src/db/prisma.js';

const queue = new Queue('email-send', { connection: bullmqConnection });

async function main() {
  const user = await prisma.user.findFirst();
  const sender = await prisma.sender.findFirst();

  if (!user || !sender) {
    throw new Error('User or Sender missing');
  }

  // Schedule 3 emails 3 minutes out
  const startTime = new Date(Date.now() + 3 * 60 * 1000);
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      subject: 'Redis Persistence Test',
      body: '<p>Testing Redis persistence across service restart</p>',
      startTime,
      delayMs: 200,
      hourlyLimit: 100,
    },
  });

  const recipients = ['persist1@example.test', 'persist2@example.test', 'persist3@example.test'];
  const emailRecords = [];

  for (let i = 0; i < recipients.length; i++) {
    const scheduledAt = new Date(startTime.getTime() + i * 200);
    const email = await prisma.email.create({
      data: {
        campaignId: campaign.id,
        userId: user.id,
        senderId: sender.id,
        recipient: recipients[i],
        subject: campaign.subject,
        body: campaign.body,
        scheduledAt,
        status: 'scheduled',
      },
    });

    const delay = Math.max(0, scheduledAt.getTime() - Date.now());
    await queue.add(
      'send-email',
      {
        emailId: email.id,
        campaignId: campaign.id,
        userId: user.id,
        senderId: sender.id,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        scheduledAt: scheduledAt.toISOString(),
      },
      {
        jobId: email.id,
        delay,
      }
    );
    emailRecords.push(email);
  }

  console.log(`Enqueued 3 delayed emails for campaign ${campaign.id}`);
  await queue.close();
  await prisma.$disconnect();
}

main().catch(console.error);
