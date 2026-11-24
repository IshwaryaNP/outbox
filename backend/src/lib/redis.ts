import IORedis from 'ioredis';
import { env } from '../config/env.js';

const redisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
  lazyConnect: false,
};

// Connection for BullMQ (needs maxRetriesPerRequest: null)
export const bullmqConnection = new IORedis(redisOptions);

// General purpose Redis client
export const redis = new IORedis({
  ...redisOptions,
  maxRetriesPerRequest: 3,
});

bullmqConnection.on('error', (err) => {
  console.error('[Redis BullMQ] Connection error:', err.message);
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

bullmqConnection.on('connect', () => {
  console.log('[Redis BullMQ] Connected');
});

redis.on('connect', () => {
  console.log('[Redis] Connected');
});
