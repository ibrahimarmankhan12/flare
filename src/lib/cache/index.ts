import { MemoryCache } from "./memory-cache";
import { SafeRedisCache } from "./safe-redis-cache";
import { UpstashRestCache } from "./upstash-rest-cache";

import { Cache } from "./cache.interface";
import { IS_DEV } from "lib/const";
import logger from "logger";

declare global {
  // eslint-disable-next-line no-var
  var __server__cache__: Cache | undefined;
}

const createCache = () => {
  const redisUrl = process.env.REDIS_URL;
  const upstashRestUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashRestToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl) {
    logger.info("Using SafeRedisCache with automatic fallback");
    return new SafeRedisCache({
      redisUrl,
      fallbackToMemory: true,
      redisOptions: {
        retryStrategy: (times) => {
          if (times > 3) {
            logger.error("Redis connection failed after 3 retries");
            return null;
          }
          return Math.min(times * 1000, 3000);
        },
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        connectTimeout: 5000,
        commandTimeout: 5000,
      },
    });
  }

  if (upstashRestUrl && upstashRestToken) {
    logger.info("Using Upstash REST cache");
    return new UpstashRestCache({
      restUrl: upstashRestUrl,
      restToken: upstashRestToken,
      keyPrefix: "flare:",
    });
  }

  if (IS_DEV) {
    logger.info("Using MemoryCache for development");
    return new MemoryCache();
  }

  logger.warn("No Redis/Upstash cache configured, using MemoryCache");
  return new MemoryCache();
};

const serverCache = globalThis.__server__cache__ || createCache();

if (IS_DEV) {
  globalThis.__server__cache__ = serverCache;
}

export { serverCache };
