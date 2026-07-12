import { randomUUID, timingSafeEqual } from 'crypto';

export interface SessionStore {
  create(): string;
  has(token: string): boolean;
  destroy(token: string): void;
}

export interface SessionStoreOptions {
  ttlMs?: number;
  maxSessions?: number;
  now?: () => number;
}

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 100;

export function createSessionStore(options: SessionStoreOptions = {}): SessionStore {
  const ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const now = options.now ?? Date.now;
  // Map preserves insertion order, so the first key is always the oldest session.
  const tokens = new Map<string, number>();

  return {
    create(): string {
      const token = randomUUID();
      tokens.set(token, now());
      while (tokens.size > maxSessions) {
        const oldest = tokens.keys().next().value as string;
        tokens.delete(oldest);
      }
      return token;
    },
    has(token: string): boolean {
      const createdAt = tokens.get(token);
      if (createdAt === undefined) return false;
      if (now() - createdAt > ttlMs) {
        tokens.delete(token);
        return false;
      }
      return true;
    },
    destroy(token: string): void {
      tokens.delete(token);
    },
  };
}

export function verifyPassword(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Burn comparable time before failing so length is not observable via timing.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export interface AttemptCheck {
  allowed: boolean;
  retryAfterMs: number;
}

export interface LoginGuard {
  canAttempt(now: number): AttemptCheck;
  recordFailure(now: number): void;
  reset(): void;
}

export function createLoginGuard(maxFailures = 5, cooldownMs = 30_000): LoginGuard {
  let failures = 0;
  let blockedUntil = 0;
  return {
    canAttempt(now: number): AttemptCheck {
      if (now < blockedUntil) {
        return { allowed: false, retryAfterMs: blockedUntil - now };
      }
      return { allowed: true, retryAfterMs: 0 };
    },
    recordFailure(now: number): void {
      failures += 1;
      if (failures >= maxFailures) {
        blockedUntil = now + cooldownMs;
        failures = 0;
      }
    },
    reset(): void {
      failures = 0;
      blockedUntil = 0;
    },
  };
}
