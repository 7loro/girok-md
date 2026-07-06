import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, join, relative } from 'path';
import matter from 'gray-matter';
import {
  findMarkdownFiles,
  parseDocument,
  isPublishable,
  checkShouldSync,
  buildPublishedIndex,
  processDocument,
  type ParsedDocument,
} from '../../../scripts/sync.ts';

export type DocStatus = 'draft' | 'pending' | 'synced' | 'built' | 'orphaned';

export interface StatusInput {
  publishable: boolean;
  inOutput: boolean;
  upToDate: boolean;
  builtAt?: Date;
  lastSyncAt?: Date;
}

export function deriveStatus(input: StatusInput): DocStatus {
  if (!input.publishable) return input.inOutput ? 'orphaned' : 'draft';
  if (!input.inOutput || !input.upToDate) return 'pending';
  if (input.builtAt && input.lastSyncAt && input.builtAt.getTime() >= input.lastSyncAt.getTime()) {
    return 'built';
  }
  return 'synced';
}

export interface DocEntry {
  slug: string;
  title: string;
  status: DocStatus;
  sourcePath: string | null;
  relPath: string | null;
  publish: boolean;
  tags: string[];
  modified: string | null;
  lastSyncAt: string | null;
  translations: string[];
  warnings: string[];
}

const LANG_SUFFIX = /^(.+)_([a-z]{2})$/;

// Collect translation langs per base slug from files like `my-post_en.md`.
function collectTranslations(postsDir: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!existsSync(postsDir)) return map;
  for (const file of readdirSync(postsDir).filter((f) => f.endsWith('.md'))) {
    const match = basename(file, '.md').match(LANG_SUFFIX);
    if (match) {
      const langs = map.get(match[1]) ?? [];
      langs.push(match[2]);
      map.set(match[1], langs);
    }
  }
  return map;
}

function builtAtOf(distDir: string, slug: string): Date | undefined {
  const htmlPath = join(distDir, 'posts', slug, 'index.html');
  try {
    return statSync(htmlPath).mtime;
  } catch {
    return undefined;
  }
}

function toTags(doc: ParsedDocument): string[] {
  const tags = doc.frontmatter.tags;
  return Array.isArray(tags) ? tags.map(String) : [];
}

export function scanDocuments(sourceRoot: string, postsDir: string, distDir: string): DocEntry[] {
  const entries: DocEntry[] = [];
  const sourceSlugs = new Set<string>();

  const docs = existsSync(sourceRoot)
    ? findMarkdownFiles(sourceRoot)
        .map((f) => parseDocument(f))
        .filter((d): d is ParsedDocument => d !== null)
    : [];
  const publishableDocs = docs.filter((d) => isPublishable(d));
  const publishedIndex = buildPublishedIndex(publishableDocs);

  for (const doc of docs) {
    const publishable = isPublishable(doc);
    // Track every source slug (publishable or not) so the posts-dir scan below only flags
    // docs whose source file is completely gone, not ones that still have a source but are
    // unpublished — those are represented by this loop's own entry (status 'orphaned').
    sourceSlugs.add(doc.slug);

    const syncCheck = publishable
      ? checkShouldSync(doc, postsDir)
      : { shouldSync: false, reason: 'not publishable' as const, lastSyncTime: undefined };
    // Warnings (broken wikilinks, missing images) only make sense for publishable docs.
    const warnings = publishable ? processDocument(doc, publishedIndex, sourceRoot).warnings : [];
    const inOutput = existsSync(join(postsDir, `${doc.slug}.md`));
    const status = deriveStatus({
      publishable,
      inOutput,
      upToDate: !syncCheck.shouldSync,
      builtAt: builtAtOf(distDir, doc.slug),
      lastSyncAt: syncCheck.lastSyncTime,
    });

    entries.push({
      slug: doc.slug,
      title: doc.title,
      status,
      sourcePath: doc.filePath,
      relPath: relative(sourceRoot, doc.filePath),
      publish: publishable,
      tags: toTags(doc),
      modified: doc.modified.toISOString(),
      lastSyncAt: syncCheck.lastSyncTime ? syncCheck.lastSyncTime.toISOString() : null,
      translations: [],
      warnings,
    });
  }

  // Synced posts whose source file is entirely gone — removed on next sync.
  const translations = collectTranslations(postsDir);
  if (existsSync(postsDir)) {
    for (const file of readdirSync(postsDir).filter((f) => f.endsWith('.md'))) {
      const slug = basename(file, '.md');
      if (LANG_SUFFIX.test(slug)) continue;
      if (sourceSlugs.has(slug)) continue;
      // Skip files that fail to read or parse rather than crashing the whole scan.
      let data: Record<string, unknown>;
      try {
        const raw = readFileSync(join(postsDir, file), 'utf-8');
        data = matter(raw).data;
      } catch {
        continue;
      }
      entries.push({
        slug,
        title: typeof data.title === 'string' ? data.title : slug,
        status: 'orphaned',
        sourcePath: null,
        relPath: null,
        publish: false,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        modified: null,
        lastSyncAt: typeof data.publish_sync_at === 'string' ? data.publish_sync_at : null,
        translations: [],
        warnings: [],
      });
    }
  }

  for (const entry of entries) {
    entry.translations = translations.get(entry.slug) ?? [];
  }

  return entries;
}
