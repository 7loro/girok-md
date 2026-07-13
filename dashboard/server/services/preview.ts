import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import {
  findMarkdownFiles,
  parseDocument,
  isPublishable,
  buildPublishedIndex,
  processDocument,
  type ParsedDocument,
} from '../../../scripts/sync.ts';

export interface DocPreview {
  title: string;
  html: string;
}

// Raw HTML stays disabled (remark-rehype default), so embedded HTML in notes
// is dropped rather than injected into the dashboard.
export async function renderMarkdownHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);
  return String(file);
}

export async function renderDocPreview(
  sourceRoot: string,
  postsDir: string,
  slug: string,
): Promise<DocPreview | null> {
  const docs = existsSync(sourceRoot)
    ? findMarkdownFiles(sourceRoot)
        .map((f) => parseDocument(f))
        .filter((d): d is ParsedDocument => d !== null)
    : [];

  const target = docs.find((d) => d.slug === slug);
  if (target) {
    // Same transforms sync applies, so the preview matches what would publish.
    const publishedIndex = buildPublishedIndex(docs.filter((d) => isPublishable(d)));
    const { document } = processDocument(target, publishedIndex, sourceRoot);
    return { title: target.title, html: await renderMarkdownHtml(document.processedContent) };
  }

  // Orphaned posts (and translation files) only exist in the output dir.
  const outputPath = join(postsDir, `${slug}.md`);
  if (!existsSync(outputPath)) return null;
  const { data, content } = matter(readFileSync(outputPath, 'utf-8'));
  const title = typeof data.title === 'string' ? data.title : slug;
  return { title, html: await renderMarkdownHtml(content) };
}
