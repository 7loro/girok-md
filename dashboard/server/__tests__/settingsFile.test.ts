import { describe, it, expect } from 'vitest';
import { parse } from 'smol-toml';
import { updateTomlContent, serializeTomlValue } from '../services/settingsFile.ts';

const SAMPLE = `# Top comment
source_root_path = "/source"
blog_name = "Casper Blog"

# Intro Section
[intro]
name = "Your Name"

[posts.translate]
enabled = true
target_langs = ["en", "ko"]
`;

describe('serializeTomlValue', () => {
  it('should serialize strings, booleans, numbers, and string arrays', () => {
    expect(serializeTomlValue('a "b"')).toBe('"a \\"b\\""');
    expect(serializeTomlValue(true)).toBe('true');
    expect(serializeTomlValue(42)).toBe('42');
    expect(serializeTomlValue(['en', 'ko'])).toBe('["en", "ko"]');
  });
});

describe('updateTomlContent', () => {
  it('should update a top-level key and keep comments', () => {
    const result = updateTomlContent(SAMPLE, { '': { blog_name: 'New Blog' } });
    expect(result).toContain('blog_name = "New Blog"');
    expect(result).toContain('# Top comment');
    expect((parse(result) as Record<string, unknown>).source_root_path).toBe('/source');
  });

  it('should update keys inside nested sections only', () => {
    const result = updateTomlContent(SAMPLE, { 'posts.translate': { enabled: false } });
    const parsed = parse(result) as { posts: { translate: { enabled: boolean } } };
    expect(parsed.posts.translate.enabled).toBe(false);
    expect(result).toContain('name = "Your Name"');
  });

  it('should update array values', () => {
    const result = updateTomlContent(SAMPLE, { 'posts.translate': { target_langs: ['ja'] } });
    expect(result).toContain('target_langs = ["ja"]');
  });

  it('should not touch a same-named key in a different section', () => {
    const result = updateTomlContent(SAMPLE, { intro: { name: 'Casper' } });
    expect(result).toContain('name = "Casper"');
    expect(result).toContain('source_root_path = "/source"');
  });

  it('should throw when a key does not exist in the file', () => {
    expect(() => updateTomlContent(SAMPLE, { '': { missing_key: 'x' } })).toThrow(/missing_key/);
  });
});
