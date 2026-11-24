import { redis } from '../lib/redis.js';
import { prisma } from '../db/prisma.js';
import { getHourlyWindowKey } from './rate-limiter.service.js';

export async function notifySlackOnRateLimit(
  userId: string,
  senderId: string,
  senderEmail: string,
  limit: number
): Promise<void> {
  const windowKey = getHourlyWindowKey(senderId);
  const guardKey = `slack_alert_sent:${windowKey}`;

  // Redis SET NX guard: Fire ONCE per sender per hour window
  const acquired = await redis.set(guardKey, '1', 'EX', 3600, 'NX');
  if (!acquired) {
    // Alert was already sent for this sender in this hour
    return;
  }

  try {
    const slackConnection = await prisma.slackConnection.findUnique({
      where: { userId },
    });

    if (!slackConnection) {
      console.log(`[Slack] No Slack connection for user ${userId}, skipping notification.`);
      return;
    }

    const text = `⚠️ *Hourly Rate Limit Reached*\nSender \`${senderEmail}\` has reached the hourly cap of *${limit} emails*. Remaining jobs for this sender have been rescheduled to the next hour window preserving dispatch order.`;

    if (slackConnection.webhookUrl) {
      const resp = await fetch(slackConnection.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      console.log(`[Slack] Webhook response status: ${resp.status}`);
    } else if (slackConnection.accessToken && slackConnection.channel) {
      const resp = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${slackConnection.accessToken}`,
        },
        body: JSON.stringify({
          channel: slackConnection.channel,
          text,
        }),
      });
      const data = await resp.json();
      console.log('[Slack] API response:', data);
    }
  } catch (err) {
    console.error('[Slack] Failed to dispatch Slack notification:', err);
  }
}
