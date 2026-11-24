import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  ELASTICSEARCH_NODE: z.string().default('http://127.0.0.1:9200'),
  WORKER_CONCURRENCY: z.coerce.number().default(5),
  MIN_DELAY_BETWEEN_SENDS_MS: z.coerce.number().default(200),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().default(100),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:4000/api/auth/google/callback'),
  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:4000/api/slack/callback'),
  SEED_SENDER_COUNT: z.coerce.number().default(3),
  SMTP_TIMEOUT_MS: z.coerce.number().default(15000), // 15 seconds
  STALE_PROCESSING_THRESHOLD_MS: z.coerce.number().default(300000), // 5 minutes (300,000ms > 15,000ms)
  DEV_AUTH_ENABLED: z.coerce.boolean().default(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.format());
  throw new Error('Environment variable validation failed');
}

if (parsed.data.DEV_AUTH_ENABLED && parsed.data.NODE_ENV === 'production') {
  console.error('❌ DEV_AUTH_ENABLED is strictly prohibited when NODE_ENV=production');
  throw new Error('DEV_AUTH_ENABLED is not allowed in production');
}

export const env = parsed.data;
