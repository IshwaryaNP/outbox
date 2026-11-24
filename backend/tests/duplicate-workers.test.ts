import { prisma } from '../src/db/prisma.js';
import { emailQueue } from '../src/queues/email.queue.js';
import { createEmailWorker } from '../src/workers/email.worker.js';

async function testConcurrentWorkersNoDuplicates() {
  console.log('🧪 [TEST 2] Testing 2 Concurrent Worker Instances on 50 emails...');

  const sender = await prisma.sender.findFirstOrThrow();
  const user = await prisma.user.findFirstOrThrow();

  // Create campaign with high hourlyLimit so rate limit does not interfere
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      subject: 'Duplicate Test Campaign 50 Emails',
      body: '<p>Testing atomic idempotency across 2 workers</p>',
      startTime: new Date(),
      delayMs: 50,
      hourlyLimit: 500,
    },
  });

  const emailIds: string[] = [];
  const now = Date.now();

  for (let i = 0; i < 50; i++) {
    const email = await prisma.email.create({
      data: {
        campaignId: campaign.id,
        userId: user.id,
        senderId: sender.id,
        recipient: `concurrent_worker_${i}_${Date.now()}@test.local`,
        subject: `Concurrent Test Email ${i + 1}`,
        body: '<p>Test body</p>',
        scheduledAt: new Date(now + i * 50),
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

  console.log(`Enqueued 50 emails. Starting 2 concurrent Worker instances...`);

  // Spin up 2 worker instances simultaneously
  const worker1 = createEmailWorker();
  const worker2 = createEmailWorker();

  console.log('Worker 1 & Worker 2 running concurrently. Waiting 18s for queue completion...');
  await new Promise((r) => setTimeout(r, 18000));

  // Query database for results
  const emails = await prisma.email.findMany({
    where: { campaignId: campaign.id },
    select: { id: true, status: true, messageId: true, attempts: true },
  });

  const sentEmails = emails.filter((e) => e.status === 'sent');
  const messageIds = sentEmails.map((e) => e.messageId).filter((id): id is string => !!id);
  const uniqueMessageIds = new Set(messageIds);

  console.log('\n📊 TEST 2 CONCURRENCY AUDIT:');
  console.log(`- Total Emails Enqueued: 50`);
  console.log(`- Total Emails in 'sent' Status: ${sentEmails.length}`);
  console.log(`- Unique messageIds: ${uniqueMessageIds.size}`);
  console.log(`- Duplicate messageIds: ${messageIds.length - uniqueMessageIds.size}`);

  await worker1.close();
  await worker2.close();
  await prisma.$disconnect();

  if (sentEmails.length === 50 && uniqueMessageIds.size === 50) {
    console.log('\n✅ TEST 2 PASSED: Exactly 50 sent, 0 duplicates across 2 simultaneous workers!');
    process.exit(0);
  } else {
    console.error('\n❌ TEST 2 FAILED!');
    process.exit(1);
  }
}

testConcurrentWorkersNoDuplicates().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
