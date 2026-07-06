import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { setPublishInContent } from '../services/publishToggle.ts';

describe('setPublishInContent', () => {
  it('should replace an existing publish line without touching other lines', () => {
    const raw = '---\ntitle: Hello # keep\npublish: false\ntags:\n  - a\n---\n\nBody';
    const result = setPublishInContent(raw, true);
    expect(result).toContain('publish: true');
    expect(result).toContain('title: Hello # keep');
    expect(result).toContain('tags:\n  - a');
    expect(matter(result).data.publish).toBe(true);
  });

  it('should turn publish off', () => {
    const raw = '---\npublish: true\n---\nBody';
    const result = setPublishInContent(raw, false);
    expect(matter(result).data.publish).toBe(false);
  });

  it('should add a publish line when frontmatter exists without one', () => {
    const raw = '---\ntitle: Hi\n---\n\nBody';
    const result = setPublishInContent(raw, true);
    expect(matter(result).data.publish).toBe(true);
    expect(matter(result).data.title).toBe('Hi');
    expect(result).toContain('Body');
  });

  it('should create frontmatter when the file has none', () => {
    const raw = '# Just content\n';
    const result = setPublishInContent(raw, true);
    expect(matter(result).data.publish).toBe(true);
    expect(result).toContain('# Just content');
  });

  it('should not rewrite quoted values elsewhere in the body', () => {
    const raw = '---\npublish: false\n---\n\nUse `publish: false` in frontmatter.';
    const result = setPublishInContent(raw, true);
    expect(result).toContain('Use `publish: false` in frontmatter.');
  });
});
