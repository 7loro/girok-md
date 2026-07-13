import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { renderMarkdownHtml, renderDocPreview } from '../services/preview.ts';

function makeDirs(): { sourceRoot: string; postsDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'preview-test-'));
  const sourceRoot = join(base, 'vault');
  const postsDir = join(base, 'posts');
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(postsDir, { recursive: true });
  return { sourceRoot, postsDir };
}

describe('renderMarkdownHtml', () => {
  it('should render headings and paragraphs', async () => {
    const html = await renderMarkdownHtml('# Title\n\nbody text');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<p>body text</p>');
  });

  it('should render GFM tables', async () => {
    const html = await renderMarkdownHtml('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  it('should render fenced code blocks', async () => {
    const html = await renderMarkdownHtml('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre><code class="language-js">');
  });

  it('should render standard image syntax', async () => {
    const html = await renderMarkdownHtml('![alt](/assets/pic.png)');
    expect(html).toContain('<img src="/assets/pic.png" alt="alt">');
  });

  it('should drop raw HTML instead of passing it through', async () => {
    const html = await renderMarkdownHtml('before\n\n<script>alert(1)</script>\n\nafter');
    expect(html).not.toContain('<script>');
    expect(html).toContain('after');
  });
});

describe('renderDocPreview', () => {
  it('should render a source document with wikilinks converted', async () => {
    const { sourceRoot, postsDir } = makeDirs();
    writeFileSync(
      join(sourceRoot, 'hello.md'),
      '---\ntitle: Hello World\npublish: true\n---\n# Heading\n\nSee [[Other Post]].\n',
    );
    writeFileSync(
      join(sourceRoot, 'other.md'),
      '---\ntitle: Other Post\npublish: true\n---\ncontent\n',
    );
    const preview = await renderDocPreview(sourceRoot, postsDir, 'hello-world');
    expect(preview).not.toBeNull();
    expect(preview!.title).toBe('Hello World');
    expect(preview!.html).toContain('<h1>Heading</h1>');
    // Wikilink to a published doc becomes a normal link, not literal [[...]].
    expect(preview!.html).not.toContain('[[Other Post]]');
    expect(preview!.html).toContain('Other Post');
  });

  it('should preview unpublished drafts from source too', async () => {
    const { sourceRoot, postsDir } = makeDirs();
    writeFileSync(join(sourceRoot, 'draft.md'), '---\ntitle: Draft Note\n---\ndraft body\n');
    const preview = await renderDocPreview(sourceRoot, postsDir, 'draft-note');
    expect(preview).not.toBeNull();
    expect(preview!.html).toContain('draft body');
  });

  it('should fall back to the synced output file when no source matches', async () => {
    const { sourceRoot, postsDir } = makeDirs();
    writeFileSync(
      join(postsDir, 'orphan.md'),
      '---\ntitle: Orphan Post\npublish: true\npublish_sync_at: "2026-01-01 00:00:00"\n---\norphan body\n',
    );
    const preview = await renderDocPreview(sourceRoot, postsDir, 'orphan');
    expect(preview).not.toBeNull();
    expect(preview!.title).toBe('Orphan Post');
    expect(preview!.html).toContain('orphan body');
  });

  it('should return null for an unknown slug', async () => {
    const { sourceRoot, postsDir } = makeDirs();
    expect(await renderDocPreview(sourceRoot, postsDir, 'nope')).toBeNull();
  });
});
