import { Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { redis } from '../lib/redis.js';

const SLACK_AUTHORIZE_ENDPOINT = 'https://slack.com/oauth/v2/authorize';
const SLACK_ACCESS_TOKEN_ENDPOINT = 'https://slack.com/api/oauth.v2.access';

/**
 * 1. GET /api/slack/connect
 * Starts Slack OAuth v2 flow with server-side stored CSRF state param
 */
export async function connectSlack(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const state = crypto.randomBytes(32).toString('hex');

  // Store state bound to userId in Redis (10 min TTL)
  await redis.set(`slack_state:${state}`, user.id, 'EX', 600);

  // If in dev mode without real credentials, allow quick mock workspace connection for testing
  if (!env.SLACK_CLIENT_ID || env.SLACK_CLIENT_ID === 'mock-slack-client-id') {
    await prisma.slackConnection.upsert({
      where: { userId: user.id },
      update: {
        teamId: 'T_DEV_WORKSPACE',
        accessToken: 'xoxb-mock-token-for-dev-verification',
        channel: '#outbox-alerts',
        webhookUrl: 'https://hooks.slack.com/services/MOCK/DEV/WEBHOOK',
      },
      create: {
        userId: user.id,
        teamId: 'T_DEV_WORKSPACE',
        accessToken: 'xoxb-mock-token-for-dev-verification',
        channel: '#outbox-alerts',
        webhookUrl: 'https://hooks.slack.com/services/MOCK/DEV/WEBHOOK',
      },
    });

    res.redirect(`${env.FRONTEND_URL}?slack=connected`);
    return;
  }

  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'chat:write,incoming-webhook',
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });

  res.redirect(`${SLACK_AUTHORIZE_ENDPOINT}?${params.toString()}`);
}

/**
 * 2. GET /api/slack/callback
 * Exchanges Slack code, verifies CSRF state, and stores token/webhook per user
 */
export async function slackCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query;

  if (error) {
    console.error('[Slack OAuth] Access denied by user:', error);
    res.redirect(`${env.FRONTEND_URL}?slack_error=${encodeURIComponent(String(error))}`);
    return;
  }

  if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
    res.redirect(`${env.FRONTEND_URL}?slack_error=invalid_callback`);
    return;
  }

  // Validate state from Redis
  const userId = await redis.get(`slack_state:${state}`);
  if (!userId) {
    res.redirect(`${env.FRONTEND_URL}?slack_error=csrf_state_invalid`);
    return;
  }
  await redis.del(`slack_state:${state}`);

  try {
    const tokenResp = await fetch(SLACK_ACCESS_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        redirect_uri: env.SLACK_REDIRECT_URI,
      }),
    });

    const data = await tokenResp.json();
    if (!data.ok) {
      console.error('[Slack OAuth] Exchange failed:', data);
      res.redirect(`${env.FRONTEND_URL}?slack_error=${encodeURIComponent(data.error || 'exchange_failed')}`);
      return;
    }

    // Persist per-user SlackConnection
    await prisma.slackConnection.upsert({
      where: { userId },
      update: {
        teamId: data.team?.id || 'UNKNOWN_TEAM',
        accessToken: data.access_token || '',
        channel: data.incoming_webhook?.channel || null,
        webhookUrl: data.incoming_webhook?.url || null,
        connectedAt: new Date(),
      },
      create: {
        userId,
        teamId: data.team?.id || 'UNKNOWN_TEAM',
        accessToken: data.access_token || '',
        channel: data.incoming_webhook?.channel || null,
        webhookUrl: data.incoming_webhook?.url || null,
      },
    });

    console.log(`✅ [Slack] Connected workspace ${data.team?.name || data.team?.id} for user ${userId}`);
    res.redirect(`${env.FRONTEND_URL}?slack=connected`);
  } catch (err) {
    console.error('[Slack OAuth] Unexpected error:', err);
    res.redirect(`${env.FRONTEND_URL}?slack_error=unexpected`);
  }
}

/**
 * 3. DELETE /api/slack/disconnect
 * Disconnects Slack integration for the current user
 */
export async function disconnectSlack(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  await prisma.slackConnection.deleteMany({
    where: { userId: user.id },
  });
  res.json({ message: 'Slack disconnected successfully' });
}

/**
 * 4. GET /api/slack/status
 * Returns current Slack connection state for the user
 */
export async function getSlackStatus(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const conn = await prisma.slackConnection.findUnique({
    where: { userId: user.id },
    select: {
      teamId: true,
      channel: true,
      connectedAt: true,
    },
  });

  res.json({
    connected: !!conn,
    connection: conn,
  });
}
