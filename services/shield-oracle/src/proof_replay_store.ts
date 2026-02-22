import { createClient } from 'redis';

type MemoryEntry = { expiresAtMs: number };

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;
let redisConnectInFlight: Promise<RedisClient | null> | null = null;
const memoryStore = new Map<string, MemoryEntry>();

export type ReplayClaimResult =
  | { ok: true }
  | { ok: false; reason: 'replay_detected' | 'backend_unavailable' };

function replayPrefix(): string {
  return process.env.RECLAIM_REPLAY_PREFIX || 'reclaim:proof-id';
}

function replayTtlSecsDefault(): number {
  const parsed = Number(process.env.RECLAIM_REPLAY_TTL_SECONDS || '300');
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 300;
}

function optionalBooleanEnv(name: string): boolean | null {
  const raw = process.env[name];
  if (raw == null) return null;
  if (raw === '1' || raw.toLowerCase() === 'true') return true;
  if (raw === '0' || raw.toLowerCase() === 'false') return false;
  return null;
}

function requireRedisForReplayProtection(): boolean {
  const explicit = optionalBooleanEnv('RECLAIM_REPLAY_REQUIRE_REDIS');
  if (explicit != null) return explicit;
  return process.env.NODE_ENV === 'production';
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
            event: 'shield_replay_redis_error',
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
          event: 'shield_replay_redis_connect_failed',
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

function cleanupMemoryStore(nowMs = Date.now()): void {
  for (const [key, value] of memoryStore.entries()) {
    if (value.expiresAtMs <= nowMs) {
      memoryStore.delete(key);
    }
  }
}

function claimInMemory(key: string, ttlSecs: number): boolean {
  const now = Date.now();
  cleanupMemoryStore(now);
  if (memoryStore.has(key)) {
    return false;
  }
  memoryStore.set(key, { expiresAtMs: now + ttlSecs * 1000 });
  return true;
}

export async function claimProofIdentifierForReplayProtection(
  identifier: string,
  ttlSecs = replayTtlSecsDefault(),
): Promise<ReplayClaimResult> {
  const normalized = identifier.trim();
  if (!normalized) return { ok: false, reason: 'replay_detected' };
  const key = `${replayPrefix()}:${normalized}`;
  const requireRedis = requireRedisForReplayProtection();

  const client = await getRedisClient();
  if (client?.isOpen) {
    try {
      const result = await client.set(key, '1', { NX: true, EX: ttlSecs });
      return result === 'OK' ? { ok: true } : { ok: false, reason: 'replay_detected' };
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'shield_replay_redis_write_failed',
          error: error instanceof Error ? error.message : String(error),
          key,
        }),
      );
      if (requireRedis) {
        return { ok: false, reason: 'backend_unavailable' };
      }
    }
  } else if (requireRedis) {
    return { ok: false, reason: 'backend_unavailable' };
  }

  return claimInMemory(key, ttlSecs)
    ? { ok: true }
    : { ok: false, reason: 'replay_detected' };
}
