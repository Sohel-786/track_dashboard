/**
 * Process-local sliding-window rate limiter.
 *
 * Serverless caveat: each lambda instance keeps its own counters, so a burst
 * spread over many cold instances is throttled per-instance rather than
 * globally. That is still enough to make online password guessing impractical,
 * and it needs no extra infrastructure. Swap the store for Redis if this ever
 * has to be exact across instances.
 */

type Bucket = {
  /** Epoch ms of each hit still inside the window. */
  hits: number[];
  /** Epoch ms until which the key is hard-blocked, or 0. */
  blockedUntil: number;
};

const buckets = new Map<string, Bucket>();

/** Stop one abusive key from growing the map without bound. */
const MAX_KEYS = 10_000;

function sweep(now: number, windowMs: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    const stale =
      bucket.blockedUntil < now &&
      (bucket.hits.length === 0 ||
        bucket.hits[bucket.hits.length - 1] < now - windowMs);
    if (stale) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  /** Seconds the caller should wait before retrying. 0 when allowed. */
  retryAfterSeconds: number;
};

export type RateLimitOptions = {
  /** Distinct attempts allowed inside the window. */
  limit: number;
  windowMs: number;
  /** How long the key stays blocked once the limit is exceeded. */
  blockMs?: number;
};

/**
 * Record one attempt against `key`. Returns whether it is allowed.
 * Call it *before* doing the expensive work you are protecting.
 */
export function rateLimit(
  key: string,
  { limit, windowMs, blockMs = windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key) ?? { hits: [], blockedUntil: 0 };

  if (bucket.blockedUntil > now) {
    buckets.set(key, bucket);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  const cutoff = now - windowMs;
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  bucket.hits.push(now);

  if (bucket.hits.length > limit) {
    bucket.blockedUntil = now + blockMs;
    bucket.hits = [];
    buckets.set(key, bucket);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(blockMs / 1000),
    };
  }

  buckets.set(key, bucket);
  return {
    ok: true,
    remaining: Math.max(0, limit - bucket.hits.length),
    retryAfterSeconds: 0,
  };
}

/** Clear a key's history — call after an attempt succeeds legitimately. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/**
 * Best-effort client IP. Vercel and most proxies set `x-forwarded-for`;
 * the left-most entry is the original client.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}
