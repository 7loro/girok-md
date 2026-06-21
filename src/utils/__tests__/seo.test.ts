import { describe, it, expect } from 'vitest';
import { toAbsoluteUrl, getCanonicalURL, getOgLocale, withTrailingSlash, excerpt } from '../seo';

const site = new URL('https://example.com');

describe('toAbsoluteUrl', () => {
  it('should resolve a relative path against the site origin', () => {
    expect(toAbsoluteUrl('/posts/foo/', site)).toBe('https://example.com/posts/foo/');
  });

  it('should keep an already absolute URL unchanged', () => {
    expect(toAbsoluteUrl('https://cdn.example.com/a.png', site)).toBe('https://cdn.example.com/a.png');
  });

  it('should fall back to the raw path when site is undefined', () => {
    expect(toAbsoluteUrl('/posts/foo/', undefined)).toBe('/posts/foo/');
  });
});

describe('getCanonicalURL', () => {
  it('should build an absolute canonical from a pathname', () => {
    expect(getCanonicalURL('/tags/seo/', site)).toBe('https://example.com/tags/seo/');
  });
});

describe('getOgLocale', () => {
  it('should map known languages to Open Graph locales', () => {
    expect(getOgLocale('en')).toBe('en_US');
    expect(getOgLocale('ko')).toBe('ko_KR');
  });

  it('should default unknown languages to en_US', () => {
    expect(getOgLocale('fr')).toBe('en_US');
  });
});

describe('withTrailingSlash', () => {
  it('should append a trailing slash when missing', () => {
    expect(withTrailingSlash('/posts/foo')).toBe('/posts/foo/');
  });

  it('should be idempotent when already present', () => {
    expect(withTrailingSlash('/posts/foo/')).toBe('/posts/foo/');
  });
});

describe('excerpt', () => {
  it('should strip markdown syntax and return plain text', () => {
    const md = '## Title\n\nThis is **bold** and a [link](https://x.com) and `code`.';
    const result = excerpt(md);
    expect(result).toBe('Title This is bold and a link and code.');
  });

  it('should remove images and wikilinks', () => {
    const md = '![alt](/a.png) text ![[embed.png]] and [[doc|Display]] end';
    const result = excerpt(md);
    expect(result).not.toContain('a.png');
    expect(result).not.toContain('embed.png');
    expect(result).toContain('Display');
    expect(result).toContain('end');
  });

  it('should truncate long text at a word boundary with an ellipsis', () => {
    const md = 'word '.repeat(100);
    const result = excerpt(md, 50);
    expect(result.length).toBeLessThanOrEqual(51); // 50 chars + ellipsis
    expect(result.endsWith('…')).toBe(true);
    expect(result).not.toContain('wor…'); // cut at a word boundary, not mid-word
  });

  it('should leave short text intact without an ellipsis', () => {
    expect(excerpt('Short text.', 160)).toBe('Short text.');
  });

  it('should strip HTML tags from synced figure markup', () => {
    const md = '<figure><img src="/assets/x.png" alt="cap" /></figure> caption text';
    const result = excerpt(md);
    expect(result).not.toContain('<img');
    expect(result).not.toContain('figure');
    expect(result).toContain('caption text');
  });
});
