import type { NextFunction, Request, Response } from "express";

// HTTP hardening for the public deployment: security headers on every response
// and a fixed-window in-memory rate limiter for abuse-prone endpoints. The
// limiter is per-instance — fine for a single Fly machine or self-host; with
// multiple replicas, limits are effectively per-replica.

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  // SPA CSP: self-hosted assets, inline styles for React style props, API on same origin.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
let sweeps = 0;

export function rateLimit(opts: { windowMs: number; max: number; name: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    // Periodic sweep so the map can't grow unboundedly on a busy box.
    if (++sweeps % 512 === 0) buckets.forEach((b, k) => { if (b.resetAt <= now) buckets.delete(k); });
    const key = `${opts.name}:${req.ip || "?"}`;
    const b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    b.count++;
    if (b.count > opts.max) {
      res.setHeader("Retry-After", String(Math.ceil((b.resetAt - now) / 1000)));
      return res.status(429).json({ message: "Too many requests — try again shortly." });
    }
    next();
  };
}
