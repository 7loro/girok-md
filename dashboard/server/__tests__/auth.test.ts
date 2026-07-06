import { describe, it, expect } from 'vitest';
import { createSessionStore, verifyPassword, createLoginGuard } from '../auth.ts';

describe('createSessionStore', () => {
  it('should create tokens that validate and can be destroyed', () => {
    const store = createSessionStore();
    const token = store.create();
    expect(token.length).toBeGreaterThan(10);
    expect(store.has(token)).toBe(true);
    store.destroy(token);
    expect(store.has(token)).toBe(false);
  });

  it('should not validate unknown tokens', () => {
    const store = createSessionStore();
    expect(store.has('nope')).toBe(false);
  });
});

describe('verifyPassword', () => {
  it('should accept exact match', () => {
    expect(verifyPassword('secret', 'secret')).toBe(true);
  });

  it('should reject mismatch and different lengths', () => {
    expect(verifyPassword('secret!', 'secret')).toBe(false);
    expect(verifyPassword('Secret', 'secret')).toBe(false);
    expect(verifyPassword('', 'secret')).toBe(false);
  });
});

describe('createLoginGuard', () => {
  it('should allow attempts before the failure limit', () => {
    const guard = createLoginGuard(5, 30_000);
    for (let i = 0; i < 4; i++) guard.recordFailure(1000);
    expect(guard.canAttempt(1000).allowed).toBe(true);
  });

  it('should block after max failures and expose retryAfterMs', () => {
    const guard = createLoginGuard(5, 30_000);
    for (let i = 0; i < 5; i++) guard.recordFailure(1000);
    const check = guard.canAttempt(2000);
    expect(check.allowed).toBe(false);
    expect(check.retryAfterMs).toBe(29_000);
  });

  it('should allow again after cooldown passes', () => {
    const guard = createLoginGuard(5, 30_000);
    for (let i = 0; i < 5; i++) guard.recordFailure(1000);
    expect(guard.canAttempt(31_001).allowed).toBe(true);
  });

  it('should clear failures on reset', () => {
    const guard = createLoginGuard(2, 30_000);
    guard.recordFailure(0);
    guard.reset();
    guard.recordFailure(100);
    expect(guard.canAttempt(100).allowed).toBe(true);
  });
});
