import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSlug,
  isPublishable,
  filterPublishable,
  extractDate,
  buildPublishedIndex,
  processWikilinks,
  extractSummaryFromCallout,
  processCallouts,
  processDocument,
  generateFrontmatter,
  filterExcludedTags,
  findImageReferences,
  findImageFile,
  transformImagePaths,
  processImages,
  cleanupUnusedImages,
  formatLocalDateTime,
  generateRobotsTxt,
  type ParsedDocument,
  type PublishableDocument,
  type Settings,
} from '../sync.ts';

function createMockDoc(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    slug: 'test-doc',
    title: 'Test Doc',
    date: new Date('2024-01-15'),
    modified: new Date('2024-01-15'),
    content: 'Test content',
    frontmatter: { publish: true },
    filePath: '/source/test-doc.md',
    ...overrides,
  };
}

describe('generateSlug', () => {
  it('should convert title to lowercase slug', () => {
    expect(generateSlug('/path/file.md', 'Hello World')).toBe('hello-world');
  });

  it('should handle korean characters', () => {
    expect(generateSlug('/path/file.md', '안녕하세요')).toBe('안녕하세요');
  });

  it('should remove special characters', () => {
    expect(generateSlug('/path/file.md', 'Hello! World?')).toBe('hello-world');
  });

  it('should fallback to filename if no title', () => {
    expect(generateSlug('/path/my-document.md')).toBe('my-document');
  });

  it('should collapse multiple spaces/dashes', () => {
    expect(generateSlug('/path/file.md', 'Hello   World')).toBe('hello-world');
  });
});

describe('isPublishable', () => {
  it('should return true for publish:true documents', () => {
    const doc = createMockDoc({ frontmatter: { publish: true } });
    expect(isPublishable(doc)).toBe(true);
  });

  it('should return false for publish:false documents', () => {
    const doc = createMockDoc({ frontmatter: { publish: false } });
    expect(isPublishable(doc)).toBe(false);
  });

  it('should return false if publish is not set', () => {
    const doc = createMockDoc({ frontmatter: {} });
    expect(isPublishable(doc)).toBe(false);
  });

  it('should return true for publish:"true" (string)', () => {
    const doc = createMockDoc({ frontmatter: { publish: 'true' } });
    expect(isPublishable(doc)).toBe(true);
  });
});

describe('filterPublishable', () => {
  it('should filter only publish:true documents', () => {
    const docs = [
      createMockDoc({ title: 'Doc1', frontmatter: { publish: true } }),
      createMockDoc({ title: 'Doc2', frontmatter: { publish: false } }),
      createMockDoc({ title: 'Doc3', frontmatter: { publish: true } }),
      createMockDoc({ title: 'Doc4', frontmatter: {} }),
    ];
    const result = filterPublishable(docs);
    expect(result).toHaveLength(2);
    expect(result.map(d => d.title)).toEqual(['Doc1', 'Doc3']);
  });
});

describe('extractDate', () => {
  it('should extract date from frontmatter', () => {
    const doc = createMockDoc({ date: new Date('2024-06-15') });
    expect(extractDate(doc).toISOString()).toBe('2024-06-15T00:00:00.000Z');
  });

  it('should use created as fallback', () => {
    const doc = createMockDoc({ date: new Date('2024-03-10') });
    expect(extractDate(doc).toISOString()).toBe('2024-03-10T00:00:00.000Z');
  });
});

describe('buildPublishedIndex', () => {
  it('should index by title', () => {
    const docs = [createMockDoc({ title: 'My Document', slug: 'my-document' })];
    const index = buildPublishedIndex(docs);
    expect(index.get('My Document')).toBeDefined();
  });

  it('should index by slug', () => {
    const docs = [createMockDoc({ title: 'My Document', slug: 'my-document' })];
    const index = buildPublishedIndex(docs);
    expect(index.get('my-document')).toBeDefined();
  });

  it('should index by aliases', () => {
    const docs = [createMockDoc({
      title: 'My Document',
      slug: 'my-document',
      frontmatter: { publish: true, aliases: ['Alias1', 'Alias2'] },
    })];
    const index = buildPublishedIndex(docs);
    expect(index.get('Alias1')).toBeDefined();
    expect(index.get('Alias2')).toBeDefined();
  });
});

describe('processWikilinks', () => {
  let publishedIndex: Map<string, ParsedDocument>;
  let currentDoc: ParsedDocument;

  beforeEach(() => {
    const publishedDoc = createMockDoc({ title: 'Published Doc', slug: 'published-doc' });
    publishedIndex = new Map([
      ['Published Doc', publishedDoc],
      ['published-doc', publishedDoc],
    ]);
    currentDoc = createMockDoc({ title: 'Current Doc' });
  });

  it('should convert wikilinks to published docs', () => {
    const content = 'Link to [[Published Doc]]';
    const { content: result, warnings } = processWikilinks(content, publishedIndex, currentDoc);
    expect(result).toBe('Link to <a href="/posts/published-doc">Published Doc</a>');
    expect(warnings).toHaveLength(0);
  });

  it('should handle display text in wikilinks', () => {
    const content = '[[Published Doc|Click here]]';
    const { content: result } = processWikilinks(content, publishedIndex, currentDoc);
    expect(result).toBe('<a href="/posts/published-doc">Click here</a>');
  });

  it('should warn on broken internal links', () => {
    const content = 'Link to [[Unpublished Doc]]';
    const { content: result, warnings } = processWikilinks(content, publishedIndex, currentDoc);
    expect(result).toBe('Link to Unpublished Doc');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Unpublished Doc');
    expect(warnings[0]).toContain('is not a published document');
  });

  it('should convert wikilinks to text for unpublished docs', () => {
    const content = 'See [[Private Note]] for details';
    const { content: result } = processWikilinks(content, publishedIndex, currentDoc);
    expect(result).toBe('See Private Note for details');
  });

  it('should handle multiple wikilinks', () => {
    const content = '[[Published Doc]] and [[Missing]]';
    const { content: result, warnings } = processWikilinks(content, publishedIndex, currentDoc);
    expect(result).toBe('<a href="/posts/published-doc">Published Doc</a> and Missing');
    expect(warnings).toHaveLength(1);
  });
});

describe('processCallouts', () => {
  it('should parse simple callouts correctly', () => {
    const content = `> [!NOTE]
> This is a note`;
    const result = processCallouts(content);
    expect(result).toContain('class="callout callout-note"');
    expect(result).toContain('This is a note');
  });

  it('should handle callout with custom title', () => {
    const content = `> [!WARNING] Important!
> Be careful`;
    const result = processCallouts(content);
    expect(result).toContain('class="callout callout-warning"');
    expect(result).toContain('Important!');
    expect(result).toContain('Be careful');
  });

  it('should handle INFO callout type', () => {
    const content = `> [!INFO]
> Some info`;
    const result = processCallouts(content);
    expect(result).toContain('callout-info');
  });

  it('should handle multiline callout content', () => {
    const content = `> [!TIP]
> Line 1
> Line 2
> Line 3`;
    const result = processCallouts(content);
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
    expect(result).toContain('Line 3');
  });

  it('should end callout at non-quoted line', () => {
    const content = `> [!NOTE]
> Note content

Regular text`;
    const result = processCallouts(content);
    expect(result).toContain('callout-note');
    expect(result).toContain('Regular text');
  });
});

describe('extractSummaryFromCallout', () => {
  it('should extract summary from SUMMARY callout', () => {
    const content = `> [!SUMMARY]
> This is the summary text`;
    const result = extractSummaryFromCallout(content);
    expect(result).toBe('This is the summary text');
  });

  it('should handle lowercase summary callout', () => {
    const content = `> [!summary]
> Lowercase summary`;
    const result = extractSummaryFromCallout(content);
    expect(result).toBe('Lowercase summary');
  });

  it('should join multiline summary into single line', () => {
    const content = `> [!SUMMARY]
> Line one
> Line two`;
    const result = extractSummaryFromCallout(content);
    expect(result).toBe('Line one Line two');
  });

  it('should return null if no summary callout', () => {
    const content = `> [!NOTE]
> This is a note`;
    const result = extractSummaryFromCallout(content);
    expect(result).toBeNull();
  });

  it('should return null for empty content', () => {
    const result = extractSummaryFromCallout('');
    expect(result).toBeNull();
  });

  it('should stop at next callout', () => {
    const content = `> [!SUMMARY]
> Summary text
> [!NOTE]
> Note text`;
    const result = extractSummaryFromCallout(content);
    expect(result).toBe('Summary text');
  });
});

describe('processDocument', () => {
  it('should process wikilinks and callouts together', () => {
    const publishedDoc = createMockDoc({ title: 'Other Doc', slug: 'other-doc' });
    const publishedIndex = new Map([
      ['Other Doc', publishedDoc],
      ['other-doc', publishedDoc],
    ]);
    
    const doc = createMockDoc({
      content: `Link to [[Other Doc]]

> [!NOTE]
> Important info`,
    });

    const { document, warnings } = processDocument(doc, publishedIndex);
    expect(document.processedContent).toContain('<a href="/posts/other-doc">Other Doc</a>');
    expect(document.processedContent).toContain('callout-note');
    expect(warnings).toHaveLength(0);
  });
});

describe('filterExcludedTags', () => {
  it('should return original tags when excludeTags is undefined', () => {
    const tags = ['typescript', 'react', 'work'];
    const result = filterExcludedTags(tags, undefined);
    expect(result).toEqual(['typescript', 'react', 'work']);
  });

  it('should return original tags when excludeTags is empty', () => {
    const tags = ['typescript', 'react', 'work'];
    const result = filterExcludedTags(tags, []);
    expect(result).toEqual(['typescript', 'react', 'work']);
  });

  it('should filter out excluded tags', () => {
    const tags = ['typescript', 'react', 'work', 'personal'];
    const excludeTags = ['work', 'personal'];
    const result = filterExcludedTags(tags, excludeTags);
    expect(result).toEqual(['typescript', 'react']);
  });

  it('should handle case where all tags are excluded', () => {
    const tags = ['work', 'personal'];
    const excludeTags = ['work', 'personal'];
    const result = filterExcludedTags(tags, excludeTags);
    expect(result).toEqual([]);
  });

  it('should handle case where no tags match exclusion list', () => {
    const tags = ['typescript', 'react'];
    const excludeTags = ['work', 'personal'];
    const result = filterExcludedTags(tags, excludeTags);
    expect(result).toEqual(['typescript', 'react']);
  });
});

describe('generateFrontmatter', () => {
  it('should generate valid frontmatter', () => {
    const doc: PublishableDocument = {
      ...createMockDoc({
        title: 'Test Title',
        date: new Date('2024-01-15'),
        frontmatter: { publish: true, tags: ['tag1', 'tag2'], summary: 'A test' },
      }),
      processedContent: '',
    };
    
    const result = generateFrontmatter(doc);
    expect(result).toContain('title: Test Title');
    expect(result).toContain('date:');
    expect(result).toContain('tags:');
    expect(result).toContain('- tag1');
    expect(result).toContain('summary: "A test"');
  });

  it('should handle optional fields', () => {
    const doc: PublishableDocument = {
      ...createMockDoc({
        title: 'Simple',
        frontmatter: { publish: true },
      }),
      processedContent: '',
    };
    
    const result = generateFrontmatter(doc);
    expect(result).toContain('title: Simple');
    expect(result).not.toContain('tags:');
    expect(result).not.toContain('summary:');
  });

  it('should exclude tags based on settings.posts.exclude_tags', () => {
    const doc: PublishableDocument = {
      ...createMockDoc({
        title: 'Tagged Post',
        date: new Date('2024-01-15'),
        frontmatter: { publish: true, tags: ['typescript', 'work', 'personal', 'react'] },
      }),
      processedContent: '',
    };
    const settings: Settings = {
      source_root_path: '/test',
      blog_name: 'Test Blog',
      posts: { exclude_tags: ['work', 'personal'] },
    };

    const result = generateFrontmatter(doc, settings);
    expect(result).toContain('- typescript');
    expect(result).toContain('- react');
    expect(result).not.toContain('- work');
    expect(result).not.toContain('- personal');
  });

  it('should not include tags section when all tags are excluded', () => {
    const doc: PublishableDocument = {
      ...createMockDoc({
        title: 'Private Post',
        date: new Date('2024-01-15'),
        frontmatter: { publish: true, tags: ['work', 'personal'] },
      }),
      processedContent: '',
    };
    const settings: Settings = {
      source_root_path: '/test',
      blog_name: 'Test Blog',
      posts: { exclude_tags: ['work', 'personal'] },
    };

    const result = generateFrontmatter(doc, settings);
    expect(result).not.toContain('tags:');
  });

  it('should include all tags when no exclude_tags in settings', () => {
    const doc: PublishableDocument = {
      ...createMockDoc({
        title: 'Full Tags Post',
        date: new Date('2024-01-15'),
        frontmatter: { publish: true, tags: ['typescript', 'work', 'personal'] },
      }),
      processedContent: '',
    };
    const settings: Settings = {
      source_root_path: '/test',
      blog_name: 'Test Blog',
    };

    const result = generateFrontmatter(doc, settings);
    expect(result).toContain('- typescript');
    expect(result).toContain('- work');
    expect(result).toContain('- personal');
  });
});

describe('image copy', () => {
  it('should detect ![[image.png]] patterns', () => {
    const content = 'Text with ![[image.png]] and ![[photo.jpg]]';
    const images = findImageReferences(content);
    expect(images).toHaveLength(2);
    expect(images[0]).toEqual({ filename: 'image.png', width: undefined });
    expect(images[1]).toEqual({ filename: 'photo.jpg', width: undefined });
  });

  it('should detect ![[image.png|width]] patterns with width', () => {
    const content = '![[CleanShot 2026-02-01 at 01.13.25@2x.png|675]]';
    const images = findImageReferences(content);
    expect(images).toHaveLength(1);
    expect(images[0]).toEqual({ filename: 'CleanShot 2026-02-01 at 01.13.25@2x.png', width: 675 });
  });

  it('should detect various image formats', () => {
    const content = '![[test.png]] ![[photo.jpg]] ![[diagram.gif]]';
    const images = findImageReferences(content);
    expect(images).toHaveLength(3);
    expect(images.map(i => i.filename)).toContain('test.png');
    expect(images.map(i => i.filename)).toContain('photo.jpg');
    expect(images.map(i => i.filename)).toContain('diagram.gif');
  });

  it('should not detect duplicate image references', () => {
    const content = '![[image.png]] and ![[image.png]]';
    const images = findImageReferences(content);
    expect(images).toHaveLength(1);
    expect(images[0].filename).toBe('image.png');
  });

  it('should handle no image references', () => {
    const content = 'Text without images';
    const images = findImageReferences(content);
    expect(images).toEqual([]);
  });

  it('should return null for missing image', () => {
    const imageName = 'missing.png';
    const docPath = '/source/docs/my-document.md';
    const sourcePath = '/source';
    const imagePath = findImageFile(imageName, docPath, sourcePath);
    expect(imagePath).toBeNull();
  });

  it('should transform image paths in markdown with line breaks', () => {
    const content = 'Text with ![[image.png]] embedded';
    const slug = 'my-doc';
    const result = transformImagePaths(content, slug);
    expect(result).toContain('![image.png](/assets/my-doc/image.png)');
    expect(result).toContain('\n\n');
  });

  it('should transform image with width to figure wrapped img tag', () => {
    const content = '![[screenshot.png|500]]';
    const slug = 'my-doc';
    const result = transformImagePaths(content, slug);
    expect(result).toContain('<figure>');
    expect(result).toContain('<img src="/assets/my-doc/screenshot.png" alt="screenshot.png" width="500" loading="lazy" decoding="async" />');
    expect(result).toContain('</figure>');
  });

  it('should handle multiple images with mixed width in markdown', () => {
    const content = '![[first.png]] and ![[second.jpg|300]]';
    const slug = 'my-doc';
    const result = transformImagePaths(content, slug);
    expect(result).toContain('![first.png](/assets/my-doc/first.png)');
    expect(result).toContain('<figure><img src="/assets/my-doc/second.jpg" alt="second.jpg" width="300" loading="lazy" decoding="async" /></figure>');
  });

  it('should warn on missing images', () => {
    const content = '![[missing.png]]';
    const doc = createMockDoc({ slug: 'test-doc', filePath: '/source/test-doc.md' });
    const sourcePath = '/source';
    const { warnings } = processImages(content, doc, sourcePath);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('missing.png');
    expect(warnings[0]).toContain('Test Doc');
  });

  it('should process images and return transformed content with line breaks', () => {
    const content = '![[image.png]]';
    const doc = createMockDoc({ slug: 'test-doc', filePath: '/source/test-doc.md' });
    const sourcePath = '/source';
    const { content: result } = processImages(content, doc, sourcePath);
    expect(result).toContain('![image.png](/assets/test-doc/image.png)');
    expect(result).toContain('\n\n');
  });
});

describe('cleanupUnusedImages', () => {
  it('should return empty result when asset dir does not exist', () => {
    const result = cleanupUnusedImages('/nonexistent/posts', '/nonexistent/assets');
    expect(result.removedImages).toEqual([]);
    expect(result.removedDirs).toEqual([]);
  });
});

describe('formatLocalDateTime', () => {
  it('should format date as YYYY-MM-DD HH:mm:ss', () => {
    const date = new Date(2024, 0, 15, 9, 5, 3);
    expect(formatLocalDateTime(date)).toBe('2024-01-15 09:05:03');
  });

  it('should zero-pad single digit values', () => {
    const date = new Date(2024, 2, 1, 1, 2, 3);
    expect(formatLocalDateTime(date)).toBe('2024-03-01 01:02:03');
  });

  it('should handle midnight', () => {
    const date = new Date(2024, 5, 15, 0, 0, 0);
    expect(formatLocalDateTime(date)).toBe('2024-06-15 00:00:00');
  });

  it('should handle end of day', () => {
    const date = new Date(2024, 11, 31, 23, 59, 59);
    expect(formatLocalDateTime(date)).toBe('2024-12-31 23:59:59');
  });
});

describe('generateRobotsTxt', () => {
  it('should include User-agent and Allow directives', () => {
    const result = generateRobotsTxt('https://example.com');
    expect(result).toContain('User-agent: *');
    expect(result).toContain('Allow: /');
  });

  it('should include sitemap URL with site URL', () => {
    const result = generateRobotsTxt('https://example.com');
    expect(result).toContain('Sitemap: https://example.com/sitemap-index.xml');
  });

  it('should use the exact site URL provided', () => {
    const result = generateRobotsTxt('https://my-blog.github.io');
    expect(result).toContain('Sitemap: https://my-blog.github.io/sitemap-index.xml');
  });
});

describe('processDocument - code block protection', () => {
  let publishedIndex: Map<string, ParsedDocument>;

  beforeEach(() => {
    const doc = createMockDoc({ title: 'Target', slug: 'target' });
    publishedIndex = new Map([
      ['Target', doc],
      ['target', doc],
    ]);
  });

  it('should not process wikilinks inside fenced code blocks', () => {
    const doc = createMockDoc({
      content: '```\n[[Target]]\n```',
    });
    const { document } = processDocument(doc, publishedIndex);
    expect(document.processedContent).toContain('[[Target]]');
    expect(document.processedContent).not.toContain('<a href');
  });

  it('should not process wikilinks inside inline code', () => {
    const doc = createMockDoc({
      content: 'Use `[[Target]]` syntax',
    });
    const { document } = processDocument(doc, publishedIndex);
    expect(document.processedContent).toContain('`[[Target]]`');
    expect(document.processedContent).not.toContain('<a href');
  });

  it('should process wikilinks outside code blocks while protecting inside', () => {
    const doc = createMockDoc({
      content: '[[Target]] and ```\n[[Target]]\n```',
    });
    const { document } = processDocument(doc, publishedIndex);
    expect(document.processedContent).toContain('<a href="/posts/target">Target</a>');
    expect(document.processedContent).toContain('```\n[[Target]]\n```');
  });

  it('should not process callouts inside code blocks', () => {
    const doc = createMockDoc({
      content: '```\n> [!NOTE]\n> Inside code\n```',
    });
    const { document } = processDocument(doc, publishedIndex);
    expect(document.processedContent).not.toContain('callout-note');
  });

  it('should handle multiple code blocks correctly', () => {
    const doc = createMockDoc({
      content: '```js\n[[Target]]\n```\n\nNormal [[Target]]\n\n```py\n[[Target]]\n```',
    });
    const { document } = processDocument(doc, publishedIndex);
    const anchors = document.processedContent.match(/<a href/g) || [];
    expect(anchors).toHaveLength(1);
  });
});

describe('processDocument - edge cases', () => {
  it('should handle empty content', () => {
    const publishedIndex = new Map<string, ParsedDocument>();
    const doc = createMockDoc({ content: '' });
    const { document, warnings } = processDocument(doc, publishedIndex);
    expect(document.processedContent).toBe('');
    expect(warnings).toHaveLength(0);
  });

  it('should handle content with only whitespace', () => {
    const publishedIndex = new Map<string, ParsedDocument>();
    const doc = createMockDoc({ content: '   \n\n   ' });
    const { document } = processDocument(doc, publishedIndex);
    expect(document.processedContent.trim()).toBe('');
  });

  it('should process nested callouts correctly', () => {
    const publishedIndex = new Map<string, ParsedDocument>();
    const doc = createMockDoc({
      content: `> [!NOTE]
> First callout
> [!WARNING]
> Second callout`,
    });
    const { document } = processDocument(doc, publishedIndex);
    expect(document.processedContent).toContain('callout-note');
    expect(document.processedContent).toContain('callout-warning');
  });

  it('should collect warnings from wikilinks and images', () => {
    const publishedIndex = new Map<string, ParsedDocument>();
    const doc = createMockDoc({
      content: '[[Missing Doc]] and ![[missing.png]]',
      filePath: '/source/test.md',
    });
    const { warnings } = processDocument(doc, publishedIndex, '/source');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some(w => w.includes('Missing Doc'))).toBe(true);
  });
});

describe('generateSlug - additional edge cases', () => {
  it('should handle empty title by using filename', () => {
    expect(generateSlug('/path/my-file.md', '')).toBe('my-file');
  });

  it('should handle title with only special characters', () => {
    expect(generateSlug('/path/file.md', '!@#$%')).toBe('');
  });

  it('should handle title with mixed korean and english', () => {
    const slug = generateSlug('/path/file.md', '리액트 React 튜토리얼');
    expect(slug).toBe('리액트-react-튜토리얼');
  });

  it('should handle title with leading and trailing dashes', () => {
    expect(generateSlug('/path/file.md', '- Hello -')).toBe('hello');
  });

  it('should handle title with numbers', () => {
    expect(generateSlug('/path/file.md', 'Chapter 1 Introduction')).toBe('chapter-1-introduction');
  });
});

describe('buildPublishedIndex - edge cases', () => {
  it('should handle empty document list', () => {
    const index = buildPublishedIndex([]);
    expect(index.size).toBe(0);
  });

  it('should handle documents without aliases', () => {
    const docs = [createMockDoc({ title: 'Test', slug: 'test', frontmatter: { publish: true } })];
    const index = buildPublishedIndex(docs);
    expect(index.size).toBe(2);
    expect(index.get('Test')).toBeDefined();
    expect(index.get('test')).toBeDefined();
  });

  it('should handle documents with empty aliases array', () => {
    const docs = [createMockDoc({
      title: 'Test',
      slug: 'test',
      frontmatter: { publish: true, aliases: [] },
    })];
    const index = buildPublishedIndex(docs);
    expect(index.size).toBe(2);
  });

  it('should index multiple documents', () => {
    const docs = [
      createMockDoc({ title: 'Doc A', slug: 'doc-a' }),
      createMockDoc({ title: 'Doc B', slug: 'doc-b' }),
    ];
    const index = buildPublishedIndex(docs);
    expect(index.get('Doc A')).toBeDefined();
    expect(index.get('doc-a')).toBeDefined();
    expect(index.get('Doc B')).toBeDefined();
    expect(index.get('doc-b')).toBeDefined();
  });
});

describe('processWikilinks - additional cases', () => {
  it('should not match image embeds ![[image]]', () => {
    const publishedIndex = new Map<string, ParsedDocument>();
    const doc = createMockDoc();
    const { content } = processWikilinks('![[image.png]]', publishedIndex, doc);
    expect(content).toBe('![[image.png]]');
  });

  it('should handle wikilink with alias to published doc', () => {
    const targetDoc = createMockDoc({ title: 'Full Title', slug: 'full-title' });
    const publishedIndex = new Map([
      ['Full Title', targetDoc],
      ['full-title', targetDoc],
      ['Alias', targetDoc],
    ]);
    const doc = createMockDoc();
    const { content } = processWikilinks('[[Alias]]', publishedIndex, doc);
    expect(content).toBe('<a href="/posts/full-title">Alias</a>');
  });

  it('should handle empty wikilink content gracefully', () => {
    const publishedIndex = new Map<string, ParsedDocument>();
    const doc = createMockDoc();
    const { content } = processWikilinks('Text without wikilinks', publishedIndex, doc);
    expect(content).toBe('Text without wikilinks');
  });
});

describe('processCallouts - additional cases', () => {
  it('should handle callout without content', () => {
    const result = processCallouts('> [!NOTE]');
    expect(result).toContain('callout-note');
  });

  it('should handle SUMMARY callout type', () => {
    const result = processCallouts('> [!SUMMARY]\n> Summary text');
    expect(result).toContain('callout-summary');
  });

  it('should preserve non-callout blockquotes', () => {
    const content = '> This is a regular quote';
    const result = processCallouts(content);
    expect(result).toBe('> This is a regular quote');
    expect(result).not.toContain('callout');
  });

  it('should handle consecutive callouts', () => {
    const content = `> [!NOTE]
> Note text
> [!WARNING]
> Warning text`;
    const result = processCallouts(content);
    expect(result).toContain('callout-note');
    expect(result).toContain('callout-warning');
  });
});

describe('generateFrontmatter - additional cases', () => {
  it('should include aliases in frontmatter', () => {
    const doc: PublishableDocument = {
      ...createMockDoc({
        title: 'Aliased Post',
        frontmatter: { publish: true, aliases: ['alias1', 'alias2'] },
      }),
      processedContent: '',
    };
    const result = generateFrontmatter(doc);
    expect(result).toContain('aliases:');
    expect(result).toContain('- alias1');
    expect(result).toContain('- alias2');
  });

  it('should extract summary from SUMMARY callout when not in frontmatter', () => {
    const doc: PublishableDocument = {
      ...createMockDoc({
        title: 'Post with Callout',
        content: '> [!SUMMARY]\n> Auto extracted summary',
        frontmatter: { publish: true },
      }),
      processedContent: '',
    };
    const result = generateFrontmatter(doc);
    expect(result).toContain('summary: "Auto extracted summary"');
  });

  it('should prefer frontmatter summary over callout summary', () => {
    const doc: PublishableDocument = {
      ...createMockDoc({
        title: 'Post',
        content: '> [!SUMMARY]\n> Callout summary',
        frontmatter: { publish: true, summary: 'Manual summary' },
      }),
      processedContent: '',
    };
    const result = generateFrontmatter(doc);
    expect(result).toContain('summary: "Manual summary"');
    expect(result).not.toContain('Callout summary');
  });

  it('should escape double quotes in summary', () => {
    const doc: PublishableDocument = {
      ...createMockDoc({
        title: 'Post',
        frontmatter: { publish: true, summary: 'Say "hello" world' },
      }),
      processedContent: '',
    };
    const result = generateFrontmatter(doc);
    expect(result).toContain('summary: "Say \\"hello\\" world"');
  });

  it('should include lang field', () => {
    const doc: PublishableDocument = {
      ...createMockDoc({
        title: 'Post',
        content: 'This is english content for testing purposes',
        frontmatter: { publish: true },
      }),
      processedContent: '',
    };
    const result = generateFrontmatter(doc);
    expect(result).toContain('lang:');
  });

  it('should include publish_sync_at timestamp', () => {
    const doc: PublishableDocument = {
      ...createMockDoc({
        title: 'Post',
        frontmatter: { publish: true },
      }),
      processedContent: '',
    };
    const result = generateFrontmatter(doc);
    expect(result).toMatch(/publish_sync_at: "\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}"/);
  });
});

describe('findImageReferences - additional cases', () => {
  it('should handle filenames with spaces', () => {
    const content = '![[my screenshot 2024.png]]';
    const images = findImageReferences(content);
    expect(images).toHaveLength(1);
    expect(images[0].filename).toBe('my screenshot 2024.png');
  });

  it('should handle filenames with @ symbol', () => {
    const content = '![[CleanShot@2x.png]]';
    const images = findImageReferences(content);
    expect(images).toHaveLength(1);
    expect(images[0].filename).toBe('CleanShot@2x.png');
  });

  it('should handle webp format', () => {
    const content = '![[photo.webp]]';
    const images = findImageReferences(content);
    expect(images).toHaveLength(1);
    expect(images[0].filename).toBe('photo.webp');
  });

  it('should handle svg format', () => {
    const content = '![[diagram.svg]]';
    const images = findImageReferences(content);
    expect(images).toHaveLength(1);
    expect(images[0].filename).toBe('diagram.svg');
  });
});

describe('transformImagePaths - additional cases', () => {
  it('should handle slug with korean characters', () => {
    const content = '![[image.png]]';
    const result = transformImagePaths(content, '한글-슬러그');
    expect(result).toContain('/assets/한글-슬러그/image.png');
  });

  it('should preserve non-image content', () => {
    const content = 'Before ![[img.png]] After';
    const result = transformImagePaths(content, 'test');
    expect(result).toContain('Before');
    expect(result).toContain('After');
    expect(result).toContain('/assets/test/img.png');
  });

  it('should add line breaks around images for markdown parsing', () => {
    const content = 'text![[img.png]]text';
    const result = transformImagePaths(content, 'slug');
    expect(result).toContain('\n\n');
  });
});
