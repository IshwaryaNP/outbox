import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { redis } from '../lib/redis.js';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * 1. GET /api/auth/google
 * Initiates Google OAuth 2.0 Authorization Code Flow
 */
export async function initiateGoogleAuth(req: Request, res: Response): Promise<void> {
  const state = crypto.randomBytes(32).toString('hex');
  // Store state in Redis for 10 minutes to prevent CSRF
  await redis.set(`oauth_state:google:${state}`, '1', 'EX', 600);

  // DEV_AUTH_ENABLED gate: default false, refused in production, never enabled unless explicitly requested
  if (env.DEV_AUTH_ENABLED) {
    if (env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'DEV_AUTH_ENABLED is strictly prohibited in production' });
      return;
    }
    // Upsert dev mock user
    const devUser = await prisma.user.upsert({
      where: { googleId: 'google-oauth-mock-user-001' },
      update: {
        name: 'Ishwarya Poojary',
        email: 'ishwarya.poojary@gmail.com',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      },
      create: {
        googleId: 'google-oauth-mock-user-001',
        email: 'ishwarya.poojary@gmail.com',
        name: 'Ishwarya Poojary',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      },
    });

    const token = jwt.sign(
      { sub: devUser.id, email: devUser.email, name: devUser.name },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${env.FRONTEND_URL}`);
    return;
  }

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    state,
    prompt: 'consent',
  });

  res.redirect(`${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
}

/**
 * 2. GET /api/auth/google/callback
 * Exchanges authorization code for tokens, fetches user info, and sets httpOnly signed JWT cookie
 */
export async function googleAuthCallback(req: Request, res: Response): Promise<void> {
  const { code, state } = req.query;

  if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
    res.status(400).redirect(`${env.FRONTEND_URL}/login?error=invalid_request`);
    return;
  }

  // Validate state to prevent CSRF
  const validState = await redis.get(`oauth_state:google:${state}`);
  if (!validState) {
    res.status(403).redirect(`${env.FRONTEND_URL}/login?error=csrf_detected`);
    return;
  }
  await redis.del(`oauth_state:google:${state}`);

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      console.error('[Google OAuth] Token exchange error:', await tokenResponse.text());
      res.redirect(`${env.FRONTEND_URL}/login?error=token_exchange_failed`);
      return;
    }

    const tokenData = await tokenResponse.json();

    // Fetch user profile from Google
    const userinfoResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userinfoResponse.ok) {
      res.redirect(`${env.FRONTEND_URL}/login?error=failed_user_info`);
      return;
    }

    const profile = await userinfoResponse.json();

    // Upsert User in PostgreSQL
    const user = await prisma.user.upsert({
      where: { googleId: profile.sub },
      update: {
        name: profile.name || profile.email.split('@')[0],
        avatar: profile.picture,
        email: profile.email,
      },
      create: {
        googleId: profile.sub,
        email: profile.email,
        name: profile.name || profile.email.split('@')[0],
        avatar: profile.picture,
      },
    });

    // Issue signed httpOnly JWT cookie
    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${env.FRONTEND_URL}`);
  } catch (err) {
    console.error('[Google OAuth] Unexpected callback error:', err);
    res.redirect(`${env.FRONTEND_URL}/login?error=oauth_error`);
  }
}

/**
 * 3. GET /api/auth/me
 * Returns current authenticated user data
 */
export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      slack: {
        select: {
          teamId: true,
          channel: true,
          connectedAt: true,
        },
      },
    },
  });

  if (!fullUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    user: {
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name,
      avatar: fullUser.avatar,
      slackConnected: !!fullUser.slack,
      slackChannel: fullUser.slack?.channel || null,
    },
  });
}

/**
 * 4. POST /api/auth/logout
 * Clears JWT cookie
 */
export function logoutUser(_req: Request, res: Response): void {
  res.clearCookie('token', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.json({ message: 'Logged out successfully' });
}
