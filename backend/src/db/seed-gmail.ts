import { prisma } from './prisma.js';

async function seedGmailSender() {
  const email = 'ishwarya9448@gmail.com';
  const pass = 'Nishanth@2007';

  const sender = await prisma.sender.upsert({
    where: { email },
    update: {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpUser: email,
      smtpPass: pass,
    },
    create: {
      email,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpUser: email,
      smtpPass: pass,
    },
  });

  console.log(`✅ Real Gmail SMTP Sender registered: ${sender.email} (${sender.smtpHost}:${sender.smtpPort})`);
  return sender;
}

seedGmailSender()
  .catch((err) => {
    console.error('Failed to seed Gmail sender:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
