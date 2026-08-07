import { sha256 } from 'js-sha256';

import { redis } from '@colanode/server/data/redis';

interface RateLimitConfig {
  limit: number;
  window: number;
}

const defaultConfig: RateLimitConfig = {
  limit: 10,
  window: 300, // 5 minutes
};

const isRateLimited = async (
  key: string,
  config: RateLimitConfig = defaultConfig
): Promise<boolean> => {
  const redisKey = `rt:${key}`;
  const attempts = await redis.incr(redisKey);

  // Set expiry on first attempt
  if (attempts === 1) {
    await redis.expire(redisKey, config.window);
  }

  return attempts > config.limit;
};

export const isAuthIpRateLimited = async (ip: string): Promise<boolean> => {
  return await isRateLimited(`ai:${ip}`, {
    limit: 100,
    window: 600, // 10 minutes
  });
};

export const isAuthEmailRateLimited = async (
  email: string
): Promise<boolean> => {
  const emailHash = sha256(email);
  return await isRateLimited(`ae:${emailHash}`, {
    limit: 10,
    window: 600, // 10 minutes
  });
};

export const isDeviceApiRateLimited = async (
  deviceId: string
): Promise<boolean> => {
  return await isRateLimited(`da:${deviceId}`, {
    limit: 100,
    window: 60, // 1 minute
  });
};

export const isDeviceSocketRateLimited = async (
  deviceId: string
): Promise<boolean> => {
  return await isRateLimited(`ds:${deviceId}`, {
    limit: 20,
    window: 60, // 1 minute
  });
};

// Public share endpoints have no account, so they are keyed by IP. Same Redis
// mechanism as the auth limits above.
export const isShareUnlockRateLimited = async (
  ip: string
): Promise<boolean> => {
  // Tight: /unlock runs argon2 verify (CPU-heavy) and is the password
  // brute-force surface, so keep it to a handful per minute per IP.
  return await isRateLimited(`su:${ip}`, {
    limit: 10,
    window: 60, // 1 minute
  });
};

export const isShareSuggestRateLimited = async (
  ip: string
): Promise<boolean> => {
  // Looser: guards suggestion DB / notification flooding.
  return await isRateLimited(`ss:${ip}`, {
    limit: 30,
    window: 60, // 1 minute
  });
};

export const isShareDataRateLimited = async (ip: string): Promise<boolean> => {
  // Generous: one request per share page load; a sane ceiling on abuse.
  return await isRateLimited(`sd:${ip}`, {
    limit: 120,
    window: 60, // 1 minute
  });
};
