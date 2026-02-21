import { createClient } from 'redis';

type Bucket = {
  windowStartedAtMs: number;
  count: number;
};

type Decision = {
  ok: boolean;
  retryAfterSec: number;
  scope: 'ip' | 'wallet' | null;
  key: string | null;
  reason?: 'rate_limited' | 'backend_unavailable';
};

const ipBuckets = new Map<string, Bucket>();
const walletBuckets = new Map<string, Bucket>();

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;
let redisConnectInFlight: Promise<RedisClient | null> | null = null;

function positiveIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? String(fallback));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function rateWindowSecs(): number {
  return positiveIntEnv('SHIELD_RATE_WINDOW_SECS', 60);
}

function ipLimitPerWindow(): number {
  return positiveIntEnv('SHIELD_RATE_LIMIT_PER_IP', 120);
}

function walletLimitPerWindow(): number {
  return positiveIntEnv('SHIELD_RATE_LIMIT_PER_WALLET', 60);
}

function requireRedisForRateLimit(): boolean {
  return process.env.SHIELD_RATE_LIMIT_REQUIRE_REDIS === '1';
}

async function getRedisClient(): Promise<RedisClient | null> {
  if (redisClient?.isOpen) return redisClient;
  if (redisConnectInFlight) return redisConnectInFlight;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  redisConnectInFlight = (async () => {
    try {
      const client = createClient({ url: redisUrl });
      client.on('error', (error) => {
        console.error(
          JSON.stringify({
            event: 'shield_rate_limit_redis_error',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
      await client.connect();
      redisClient = client;
      return redisClient;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'shield_rate_limit_redis_connect_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    } finally {
      redisConnectInFlight = null;
    }
  })();

  return redisConnectInFlight;
}

function consume(
  buckets: Map<string, Bucket>,
  key: string,
  limit: number,
  windowMs: number,
  nowMs: number
): Decision {
  if (!key || limit <= 0 || windowMs <= 0) {
    return { ok: true, retryAfterSec: 0, scope: null, key: null };
  }

  const existing = buckets.get(key);
  if (!existing || nowMs - existing.windowStartedAtMs >= windowMs) {
    buckets.set(key, { windowStartedAtMs: nowMs, count: 1 });
    return { ok: true, retryAfterSec: 0, scope: null, key: null };
  }

  if (existing.count >= limit) {
    const retryMs = windowMs - (nowMs - existing.windowStartedAtMs);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)),
      scope: null,
      key,
      reason: 'rate_limited',
    };
  }

  existing.count += 1;
  return { ok: true, retryAfterSec: 0, scope: null, key: null };
}

async function consumeRedis(
  client: RedisClient,
  key: string,
  limit: number,
  windowSecs: number,
): Promise<Decision> {
  const response = (await client.eval(
    `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      local ttl = redis.call('TTL', KEYS[1])
      return { current, ttl }
    `,
    { keys: [key], arguments: [String(windowSecs)] },
  )) as Array<number | string> | null;

  const current = Number(response?.[0] ?? 0);
  const ttl = Number(response?.[1] ?? windowSecs);
  if (current > limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Number.isFinite(ttl) && ttl > 0 ? ttl : windowSecs),
      scope: null,
      key,
      reason: 'rate_limited',
    };
  }

  return { ok: true, retryAfterSec: 0, scope: null, key: null };
}

export function cleanupRateLimitState(nowMs = Date.now()): void {
  const windowMs = rateWindowSecs() * 1000;
  for (const [k, v] of ipBuckets.entries()) {
    if (nowMs - v.windowStartedAtMs >= windowMs) ipBuckets.delete(k);
  }
  for (const [k, v] of walletBuckets.entries()) {
    if (nowMs - v.windowStartedAtMs >= windowMs) walletBuckets.delete(k);
  }
}

async function consumeForScope(input: {
  scope: 'ip' | 'wallet';
  key: string;
  limit: number;
  windowSecs: number;
  nowMs: number;
  redis: RedisClient | null;
  requireRedis: boolean;
}): Promise<Decision> {
  const { scope, key, limit, windowSecs, nowMs, redis, requireRedis } = input;
  if (!key || limit <= 0 || windowSecs <= 0) {
    return { ok: true, retryAfterSec: 0, scope: null, key: null };
  }

  if (redis?.isOpen) {
    try {
      const redisDecision = await consumeRedis(redis, `shield:rate:${scope}:${key}`, limit, windowSecs);
      if (!redisDecision.ok) return { ...redisDecision, scope };
      return redisDecision;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'shield_rate_limit_redis_write_failed',
          scope,
          key,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      if (requireRedis) {
        return {
          ok: false,
          retryAfterSec: 1,
          scope,
          key,
          reason: 'backend_unavailable',
        };
      }
    }
  } else if (requireRedis) {
    return {
      ok: false,
      retryAfterSec: 1,
      scope,
      key,
      reason: 'backend_unavailable',
    };
  }

  const fallbackWindowMs = windowSecs * 1000;
  const bucketMap = scope === 'ip' ? ipBuckets : walletBuckets;
  const memoryDecision = consume(bucketMap, key, limit, fallbackWindowMs, nowMs);
  if (!memoryDecision.ok) return { ...memoryDecision, scope };
  return memoryDecision;
}

export async function evaluateShieldRateLimit(input: {
  ip: string;
  wallet: string | null;
}): Promise<Decision> {
  const now = Date.now();
  const windowSecs = rateWindowSecs();
  const requireRedis = requireRedisForRateLimit();
  const redis = await getRedisClient();
  cleanupRateLimitState(now);

  const ipDecision = await consumeForScope({
    scope: 'ip',
    key: input.ip,
    limit: ipLimitPerWindow(),
    windowSecs,
    nowMs: now,
    redis,
    requireRedis,
  });
  if (!ipDecision.ok) {
    return ipDecision;
  }

  if (input.wallet) {
    const walletDecision = await consumeForScope({
      scope: 'wallet',
      key: input.wallet,
      limit: walletLimitPerWindow(),
      windowSecs,
      nowMs: now,
      redis,
      requireRedis,
    });
    if (!walletDecision.ok) {
      return walletDecision;
    }
  }

  return { ok: true, retryAfterSec: 0, scope: null, key: null };
}
