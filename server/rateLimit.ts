import type { Request, Response, NextFunction } from 'express';

interface BucketEntry {
  timestamps: number[];
}

const buckets = new Map<string, BucketEntry>();
const inFlightLocks = new Set<string>();

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

    const entry = buckets.get(key) || { timestamps: [] };
    entry.timestamps = entry.timestamps.filter((ts) => ts > cutoff);

    if (entry.timestamps.length >= options.maxRequests) {
      const oldest = entry.timestamps[0] || now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        code: 'RATE_LIMIT_EXCEEDED',
        error: `Too many requests. Please wait ${retryAfterSec} seconds and try again.`,
      });
      return;
    }

    entry.timestamps.push(now);
    buckets.set(key, entry);
    next();
  };
}

export function acquireInFlightLock(lockKey: string): boolean {
  if (inFlightLocks.has(lockKey)) {
    return false;
  }
  inFlightLocks.add(lockKey);
  return true;
}

export function releaseInFlightLock(lockKey: string): void {
  inFlightLocks.delete(lockKey);
}
