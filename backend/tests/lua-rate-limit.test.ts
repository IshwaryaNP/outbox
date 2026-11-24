import { redis } from '../src/lib/redis.js';

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

async function runLuaTest() {
  console.log('🧪 [TEST 4] Testing Lua Rate Limit Script Atomicity under Concurrency...');
  const testKey = `test:rl:${Date.now()}`;
  const limit = 10;
  const concurrency = 100;

  console.log(`Firing ${concurrency} simultaneous calls with limit = ${limit}...`);

  const promises: Promise<number>[] = [];
  for (let i = 0; i < concurrency; i++) {
    promises.push(
      redis.eval(HOURLY_RATE_LIMIT_LUA, 1, testKey, limit) as Promise<number>
    );
  }

  const results = await Promise.all(promises);

  const allowedCount = results.filter((r) => r === 1).length;
  const deniedCount = results.filter((r) => r === 0).length;
  const finalCounter = await redis.get(testKey);
  const ttl = await redis.ttl(testKey);

  console.log(`\n📊 RESULTS:`);
  console.log(`- Total requests: ${concurrency}`);
  console.log(`- Limit configured: ${limit}`);
  console.log(`- Allowed count: ${allowedCount}`);
  console.log(`- Denied count: ${deniedCount}`);
  console.log(`- Redis Counter: ${finalCounter}`);
  console.log(`- Key TTL: ${ttl}s`);

  // Cleanup test key
  await redis.del(testKey);
  await redis.quit();

  if (allowedCount === limit && deniedCount === concurrency - limit) {
    console.log('\n✅ ASSERTION PASSED: Exactly 10 allowed, 90 denied under concurrent load!');
    process.exit(0);
  } else {
    console.error(`\n❌ ASSERTION FAILED: Expected ${limit} allowed, but got ${allowedCount}`);
    process.exit(1);
  }
}

runLuaTest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
