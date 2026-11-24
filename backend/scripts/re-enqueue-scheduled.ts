import { Queue } from 'bullmq';
import { bullmqConnection } from '../src/lib/redis.js';
import { prisma } from '../src/db/prisma.js';

const queue = new Queue('email-send', { connection: bullmqConnection });

async function main() {
  const scheduled = await prisma.email.findMany({
    where: { status: 'scheduled' },
  });

  console.log(`Found ${scheduled.length} scheduled emails in DB`);

  for (const email of scheduled) {
    const existing = await queue.getJob(email.id);
    if (existing) {
      await existing.remove();
    }
    await queue.add(
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
      },
      {
        jobId: email.id,
        delay: 0,
      }
    );
    console.log(`Enqueued fresh job for ${email.recipient}`);
  }

  await queue.close();
  await prisma.$disconnect();
}

main().catch(console.error);
