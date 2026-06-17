import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Initialize Upstash Redis client
// Note: If credentials are not set in .env, we initialize with empty strings to avoid crash at compile/init time,
// but check at runtime before making requests.
const redis = new Redis({
  url: redisUrl || "https://placeholder.upstash.io",
  token: redisToken || "placeholder",
});

export const loginRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"), // 5 attempts per 15 minutes
  analytics: true,
  prefix: "@upstash/ratelimit/kolo_login",
});

export const forgotPasswordRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "1 h"), // 3 attempts per 1 hour
  analytics: true,
  prefix: "@upstash/ratelimit/kolo_forgot",
});

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Executes a rate limit check against Upstash Redis.
 * If credentials are not configured, it returns success: true but logs a warning (dev-friendly bypass).
 * If Redis fails, it fails closed (success: false) to maintain security integrity.
 */
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string
): Promise<RateLimitResult> {
  if (!redisUrl || !redisToken || redisUrl.includes("placeholder")) {
    console.warn(
      `⚠️ Upstash Redis is not configured in .env. Rate limiting for "${identifier}" was bypassed.`
    );
    return {
      success: true,
      limit: 999,
      remaining: 999,
      reset: Date.now(),
    };
  }

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    console.error(`❌ Rate limiting check failed for ${identifier}:`, error);
    // Security action: fail closed to prevent brute-forcing during Redis downtime.
    return {
      success: false,
      limit: 0,
      remaining: 0,
      reset: Date.now() + 60 * 1000, // lock for 1 minute as fallback
    };
  }
}
