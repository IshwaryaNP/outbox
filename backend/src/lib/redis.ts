import IORedis from 'ioredis';
import { env } from '../config/env.js';

// Railway provides REDIS_URL (e.g. redis://:password@host:port)
// Fall back to individual REDIS_HOST / REDIS_PORT / REDIS_PASSWORD
function buildRedisOptions(extraOpts: Record<string, unknown> = {}) {
  if (env.REDIS_URL) {
    return { ...extraOpts, lazyConnect: false, enableOfflineQueue: false, url: env.REDIS_URL };
  }
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: false,
    enableOfflineQueue: false,
    ...extraOpts,
  };
}

// Connection for BullMQ (needs maxRetriesPerRequest: null)
export const bullmqConnection = env.REDIS_URL
  ? new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: false })
  : new IORedis({ ...buildRedisOptions(), maxRetriesPerRequest: null });

// General purpose Redis client
export const redis = env.REDIS_URL
  ? new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 3, enableOfflineQueue: false })
  : new IORedis({ ...buildRedisOptions(), maxRetriesPerRequest: 3 });

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
