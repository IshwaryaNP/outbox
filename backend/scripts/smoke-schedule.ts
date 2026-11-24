import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { prisma } from '../src/db/prisma.js';

async function runSmokeTest() {
  // 1. Get or create smoke test user
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        googleId: 'smoke-test-user-001',
        email: 'smoke@example.test',
        name: 'Smoke Test User',
      },
    });
  }

  // 2. Generate signed JWT token
  const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: '1h' });

  // 3. Prepare campaign schedule payload (starting 1 minute from now)
  const startTime = new Date(Date.now() + 60 * 1000).toISOString();
  const payload = {
    subject: 'Smoke Test Campaign',
    body: '<p>This is a smoke test email.</p>',
    recipients: ['user1@example.test', 'user2@example.test', 'user3@example.test'],
    startTime,
    delayMs: 200,
    hourlyLimit: 100,
  };

  console.log('--- Calling POST http://localhost:4000/api/campaigns/schedule ---');
  console.log('Start time (1 min out):', startTime);

  const res = await fetch('http://localhost:4000/api/campaigns/schedule', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  console.log('HTTP Status:', res.status);
  console.log('Response body:', JSON.stringify(data, null, 2));

  await prisma.$disconnect();
}

runSmokeTest().catch(console.error);
