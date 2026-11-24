import nodemailer from 'nodemailer';
import { prisma } from '../src/db/prisma.js';

async function main() {
  console.log('--- Cleaning bad Gmail sender & ensuring 3 Ethereal senders ---');
  
  // 1. Delete or remove bad sender if no emails attached or reassign emails first
  const etherealSenders = await prisma.sender.findMany({
    where: { email: { contains: 'ethereal.email' } },
  });

  // Create additional Ethereal senders until we have at least 3
  while (etherealSenders.length < 3) {
    const acc = await nodemailer.createTestAccount();
    const existing = etherealSenders.find(s => s.email === acc.user);
    if (!existing) {
      const created = await prisma.sender.create({
        data: {
          email: acc.user,
          smtpHost: acc.smtp.host,
          smtpPort: acc.smtp.port,
          smtpUser: acc.user,
          smtpPass: acc.pass,
        },
      });
      etherealSenders.push(created);
      console.log('Created Ethereal Sender:', created.email);
    }
  }

  // 2. Reassign all emails from ishwarya9448@gmail.com to the first Ethereal sender
  const badSender = await prisma.sender.findUnique({
    where: { email: 'ishwarya9448@gmail.com' },
  });

  if (badSender) {
    const reassigned = await prisma.email.updateMany({
      where: { senderId: badSender.id },
      data: {
        senderId: etherealSenders[0].id,
        status: 'scheduled',
        attempts: 0,
        error: null,
      },
    });
    console.log(`Reassigned ${reassigned.count} emails from bad Gmail sender to ${etherealSenders[0].email}`);
    
    // Delete bad sender
    await prisma.sender.delete({ where: { id: badSender.id } });
    console.log('Deleted bad sender ishwarya9448@gmail.com');
  }

  console.log('Active senders:');
  const allSenders = await prisma.sender.findMany();
  console.table(allSenders.map(s => ({ id: s.id, email: s.email, host: s.smtpHost, port: s.smtpPort })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
