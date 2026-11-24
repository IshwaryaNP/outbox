import { prisma } from './prisma.js';

async function seedDevUser() {
  const user = await prisma.user.upsert({
    where: { googleId: 'dev-google-id-001' },
    update: {},
    create: {
      googleId: 'dev-google-id-001',
      email: 'dev@outbox.local',
      name: 'Dev User',
      avatar: null,
    },
  });
  console.log(`✅ Dev user ready: ${user.id} (${user.email})`);
  console.log(`   Set header: X-Dev-User-Id: ${user.id}`);
  return user;
}

seedDevUser()
  .catch((err) => {
    console.error('Dev seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
