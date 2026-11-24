import { Queue } from 'bullmq';
import { bullmqConnection } from '../src/lib/redis.js';
import { prisma } from '../src/db/prisma.js';

const queue = new Queue('email-send', { connection: bullmqConnection });

async function main() {
  const user = await prisma.user.findFirst();
  const sender = await prisma.sender.findFirst();

  // Schedule 3 emails starting 5 seconds from now
  const startTime = new Date(Date.now() + 5000);
  const campaign = await prisma.campaign.create({
    data: {
      userId: user!.id,
      subject: 'Lag Measurement Test',
      body: '<p>Testing execution lagMs precision</p>',
      startTime,
      delayMs: 200,
      hourlyLimit: 100,
    },
  });

  const recipients = ['lag1@example.test', 'lag2@example.test', 'lag3@example.test'];

  for (let i = 0; i < recipients.length; i++) {
    const scheduledAt = new Date(startTime.getTime() + i * 200);
    const email = await prisma.email.create({
      data: {
        campaignId: campaign.id,
        userId: user!.id,
        senderId: sender!.id,
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
        userId: user!.id,
        senderId: sender!.id,
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
  }

  console.log(`Scheduled 3 emails for campaign ${campaign.id} due at ${startTime.toISOString()}`);
  await queue.close();
  await prisma.$disconnect();
}

main().catch(console.error);
