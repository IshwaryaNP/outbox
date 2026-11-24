import { prisma } from '../src/db/prisma.js';
import { emailQueue } from '../src/queues/email.queue.js';
import { redis } from '../src/lib/redis.js';
import { getHourlyWindowKey } from '../src/services/rate-limiter.service.js';

async function testRateLimitRoll() {
  console.log('🧪 [TEST 3] Testing Rate Limit (Limit=3, 10 emails scheduled)...');

  // 1. Get or create test sender
  const sender = await prisma.sender.findFirstOrThrow();
  const user = await prisma.user.findFirstOrThrow();

  // Clear existing redis rate limit key for this sender window
  const windowKey = getHourlyWindowKey(sender.id);
  await redis.del(windowKey);

  console.log(`Using sender: ${sender.email} | Redis Key: ${windowKey}`);

  // Create campaign with hourlyLimit = 3
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      subject: 'Rate Limit Test Campaign',
      body: '<p>Testing hourly limit roll</p>',
      startTime: new Date(),
      delayMs: 200,
      hourlyLimit: 3,
    },
  });

  const emailIds: string[] = [];
  const now = Date.now();

  for (let i = 0; i < 10; i++) {
    const email = await prisma.email.create({
      data: {
        campaignId: campaign.id,
        userId: user.id,
        senderId: sender.id,
        recipient: `ratelimit_test_${i}_${Date.now()}@test.local`,
        subject: `Rate Limit Test ${i + 1}`,
        body: '<p>Testing rate limit roll</p>',
        scheduledAt: new Date(now + i * 200),
        status: 'scheduled',
      },
    });
    emailIds.push(email.id);

    await emailQueue.add(
      'send-email',
      {
        emailId: email.id,
        campaignId: campaign.id,
        userId: user.id,
        senderId: sender.id,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        scheduledAt: email.scheduledAt.toISOString(),
      },
      { jobId: email.id }
    );
  }

  console.log(`Enqueued 10 emails for campaign ${campaign.id}. Waiting 10s for worker processing...`);

  await new Promise((r) => setTimeout(r, 10000));

  // Inspect DB status
  const emails = await prisma.email.findMany({
    where: { campaignId: campaign.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, recipient: true, status: true, scheduledAt: true, attempts: true, error: true },
  });

  console.log('\n📊 DB ROWS STATUS:');
  emails.forEach((e, idx) => {
    console.log(`[#${idx + 1}] ${e.recipient} | Status: ${e.status} | ScheduledAt: ${e.scheduledAt.toISOString()}`);
  });

  const sentCount = emails.filter((e) => e.status === 'sent').length;
  const scheduledCount = emails.filter((e) => e.status === 'scheduled').length;
  const failedCount = emails.filter((e) => e.status === 'failed').length;

  const keyVal = await redis.get(windowKey);
  const ttl = await redis.ttl(windowKey);

  console.log(`\n📊 AUDIT SUMMARY:`);
  console.log(`- Total Scheduled: 10`);
  console.log(`- Sent in current hour: ${sentCount} (Expected: 3)`);
  console.log(`- Rolled to next hour (still 'scheduled'): ${scheduledCount} (Expected: 7)`);
  console.log(`- Failed count: ${failedCount} (Expected: 0)`);
  console.log(`- Redis Key: "${windowKey}"`);
  console.log(`- Redis Key Value: ${keyVal}`);
  console.log(`- Redis Key TTL: ${ttl}s`);

  await redis.quit();
  await prisma.$disconnect();

  if (sentCount === 3 && scheduledCount === 7 && failedCount === 0) {
    console.log('\n✅ TEST 3 PASSED: Exactly 3 sent, 7 rolled to next hour, 0 failed or dropped!');
    process.exit(0);
  } else {
    console.error(`\n❌ TEST 3 FAILED!`);
    process.exit(1);
  }
}

testRateLimitRoll().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
