import { randomUUID, timingSafeEqual } from 'crypto';

export interface SessionStore {
  create(): string;
  has(token: string): boolean;
  destroy(token: string): void;
}

export function createSessionStore(): SessionStore {
  const tokens = new Set<string>();
  return {
    create(): string {
      const token = randomUUID();
      tokens.add(token);
      return token;
    },
    has(token: string): boolean {
      return tokens.has(token);
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
