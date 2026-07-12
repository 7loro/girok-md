import { describe, it, expect } from 'vitest';
import { normalizeBaseUrl, getBaseUrl } from '../base';

describe('normalizeBaseUrl', () => {
  it('should append a trailing slash when missing', () => {
    expect(normalizeBaseUrl('/blog')).toBe('/blog/');
  });

  it('should keep an existing trailing slash', () => {
    expect(normalizeBaseUrl('/blog/')).toBe('/blog/');
  });

  it('should keep the root base unchanged', () => {
    expect(normalizeBaseUrl('/')).toBe('/');
  });

  it('should handle nested base paths', () => {
    expect(normalizeBaseUrl('/a/b/c')).toBe('/a/b/c/');
  });
});

describe('getBaseUrl', () => {
  it('should return a value ending with a trailing slash', () => {
    expect(getBaseUrl().endsWith('/')).toBe(true);
  });

  it('should default to the root base in the test environment', () => {
    expect(getBaseUrl()).toBe('/');
  });
});
