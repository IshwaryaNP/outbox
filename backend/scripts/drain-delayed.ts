/**
 * Drain all delayed BullMQ jobs by re-enqueuing them immediately.
 * This bypasses the next-hour delay imposed by the rate limiter rollover.
 * Run once: npx tsx scripts/drain-delayed.ts
 */
import { Queue } from 'bullmq';
import { bullmqConnection } from '../src/lib/redis.js';
import { prisma } from '../src/db/prisma.js';

const queue = new Queue('email-send', { connection: bullmqConnection });

async function drainDelayed() {
  const delayed = await queue.getDelayed();
  console.log(`Found ${delayed.length} delayed jobs`);

  for (const job of delayed) {
    const jobId = job.id;
    if (!jobId) continue;

    // Remove the delayed job and re-add it immediately (delay=0)
    await job.remove();
    await queue.add(
      'send-email',
      job.data,
      {
        jobId,
        delay: 0,
      }
    );
    console.log(`Re-enqueued job ${jobId} -> ${job.data.recipient}`);
  }

  // Also reset scheduled emails that might have been left in 'processing' state
  await prisma.email.updateMany({
    where: { status: 'processing' },
    data: { status: 'scheduled' },
  });

  console.log('Done draining delayed jobs');
  await queue.close();
  await prisma.$disconnect();
  process.exit(0);
}

drainDelayed().catch(console.error);
