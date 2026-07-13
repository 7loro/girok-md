import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { formatYamlString } from '../yamlUtils.ts';

// Round-trip helper: the formatted value must parse back to the original string.
function roundTrip(value: string): unknown {
  const { data } = matter(`---\nkey: ${formatYamlString(value)}\n---\n`);
  return data.key;
}

describe('formatYamlString', () => {
  it('should leave plain strings unquoted', () => {
    expect(formatYamlString('Hello World')).toBe('Hello World');
  });

  it('should quote strings containing a colon', () => {
    expect(roundTrip('Guide: Getting Started')).toBe('Guide: Getting Started');
  });

  it('should quote strings containing a hash', () => {
    expect(roundTrip('Tips #1')).toBe('Tips #1');
  });

  it('should escape embedded quotes and backslashes', () => {
    expect(roundTrip('say "hi" \\ bye')).toBe('say "hi" \\ bye');
  });

  it('should quote strings starting with a dash', () => {
    expect(roundTrip('- looks like a list')).toBe('- looks like a list');
  });

  it('should quote boolean/null-looking literals so they stay strings', () => {
    expect(roundTrip('true')).toBe('true');
    expect(roundTrip('null')).toBe('null');
  });

  it('should quote number-looking strings so they stay strings', () => {
    expect(roundTrip('42')).toBe('42');
  });
});
