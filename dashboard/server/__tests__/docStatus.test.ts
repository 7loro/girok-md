import { describe, it, expect } from 'vitest';
import { deriveStatus, type StatusInput } from '../services/docStatus.ts';

function makeInput(overrides: Partial<StatusInput> = {}): StatusInput {
  return {
    publishable: true,
    inOutput: true,
    upToDate: true,
    builtAt: undefined,
    lastSyncAt: undefined,
    ...overrides,
  };
}

describe('deriveStatus', () => {
  it('should be draft when not publishable', () => {
    expect(deriveStatus(makeInput({ publishable: false }))).toBe('draft');
  });

  it('should be pending when publishable but not yet in output', () => {
    expect(deriveStatus(makeInput({ inOutput: false, upToDate: false }))).toBe('pending');
  });

  it('should be pending when synced copy is stale', () => {
    expect(deriveStatus(makeInput({ upToDate: false }))).toBe('pending');
  });

  it('should be synced when up to date but never built', () => {
    expect(deriveStatus(makeInput())).toBe('synced');
  });

  it('should be synced when build predates the last sync', () => {
    const input = makeInput({
      builtAt: new Date('2026-07-01T00:00:00'),
      lastSyncAt: new Date('2026-07-02T00:00:00'),
    });
    expect(deriveStatus(input)).toBe('synced');
  });

  it('should be built when build is at or after the last sync', () => {
    const input = makeInput({
      builtAt: new Date('2026-07-03T00:00:00'),
      lastSyncAt: new Date('2026-07-02T00:00:00'),
    });
    expect(deriveStatus(input)).toBe('built');
  });
});
