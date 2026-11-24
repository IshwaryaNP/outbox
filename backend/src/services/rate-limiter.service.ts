import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';

/**
 * Atomic Lua script to check and increment hourly rate limit.
 * Key: rl:{senderId}:{YYYYMMDDHH}
 * Logic:
 *  1. INCR key
 *  2. If count == 1, set EXPIRE to 7200 seconds (2 hours)
 *  3. If count <= limit, return 1 (allowed)
 *  4. Else return 0 (denied)
 */
const HOURLY_RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, 7200)
end
if current <= limit then
  return 1
else
  return 0
end
`;

export function getHourlyWindowKey(senderId: string, date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  return `rl:${senderId}:${yyyy}${mm}${dd}${hh}`;
}

export function getNextHourStart(date: Date = new Date()): Date {
  const nextHour = new Date(date);
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);
  return nextHour;
}

export async function checkAndIncrementHourlyRateLimit(
  senderId: string,
  campaignHourlyLimit: number
): Promise<{ allowed: boolean; nextHourStart: Date }> {
  const effectiveLimit = Math.min(campaignHourlyLimit, env.MAX_EMAILS_PER_HOUR_PER_SENDER);
  const key = getHourlyWindowKey(senderId);

  const result = (await redis.eval(HOURLY_RATE_LIMIT_LUA, 1, key, effectiveLimit)) as number;
  const allowed = result === 1;
  const nextHourStart = getNextHourStart();

  return { allowed, nextHourStart };
}
