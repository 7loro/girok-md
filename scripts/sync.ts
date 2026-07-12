#!/usr/bin/env node
import { parse } from 'smol-toml';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  rmSync,
  copyFileSync,
} from 'fs';
import { basename, extname, join, resolve, dirname } from 'path';
import matter from 'gray-matter';
import { detectLanguage } from './translate.ts';
import { formatYamlString } from './yamlUtils.ts';

// Configuration file path
const settingPath = resolve(import.meta.dirname, '..', 'setting.toml');

export interface TranslateSettings {
  enabled: boolean;
  target_langs: string[];
  provider?: 'openai' | 'anthropic' | 'google';
  api_key?: string;
  model?: string;
}

export interface PostsSettings {
  exclude_tags?: string[];
  translate?: TranslateSettings;
}

export interface Settings {
  source_root_path: string;
  blog_name: string;
  site_url?: string;
  posts?: PostsSettings;
}

export function loadSettings(): Settings {
  const content = readFileSync(settingPath, 'utf-8');
  return parse(content) as unknown as Settings;
}

export interface ParsedDocument {
  slug: string;
  title: string;
  date: Date;
  modified: Date;
  content: string;
  frontmatter: Record<string, unknown>;
  filePath: string;
}

export interface PublishableDocument extends ParsedDocument {
  processedContent: string;
}

export function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  
  function walk(currentDir: string) {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (extname(entry) === '.md') {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

export function parseDocument(filePath: string): ParsedDocument | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw);
    
    const title = data.title || basename(filePath, '.md');
    const slug = generateSlug(filePath, data.title);
    
    const stat = statSync(filePath);
    const modified = stat.mtime;
    
    let date: Date;
    if (data.date) {
      date = new Date(data.date);
    } else if (data.created) {
      date = new Date(data.created);
    } else {
      date = stat.birthtime;
    }
    
    return { slug, title, date, modified, content, frontmatter: data, filePath };
  } catch (error) {
    // Surface the reason so silently skipped documents are debuggable.
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  Skipping unreadable document ${filePath}: ${detail}`);
    return null;
  }
}

export function generateSlug(filePath: string, title?: string): string {
  const name = title || basename(filePath, '.md');
  return name
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isPublishable(doc: ParsedDocument): boolean {
  const publish = doc.frontmatter.publish;
  return publish === true || publish === "true";
}

export function filterPublishable(docs: ParsedDocument[]): ParsedDocument[] {
  return docs.filter(isPublishable);
}

export interface SyncCheckResult {
  shouldSync: boolean;
  reason: string;
  lastSyncTime?: Date;
}

export function checkShouldSync(doc: ParsedDocument, outputDir: string): SyncCheckResult {
  if (!isPublishable(doc)) {
    return { shouldSync: false, reason: 'not publishable' };
  }
  
  const outputPath = join(outputDir, `${doc.slug}.md`);
  if (!existsSync(outputPath)) {
    return { shouldSync: true, reason: 'new file' };
  }
  
  try {
    const existingContent = readFileSync(outputPath, 'utf-8');
    const { data } = matter(existingContent);
    const publishSyncAt = data.publish_sync_at;
    
    if (!publishSyncAt) {
      return { shouldSync: true, reason: 'no sync timestamp' };
    }
    
    let lastSyncTime: Date;
    if (publishSyncAt instanceof Date) {
      lastSyncTime = publishSyncAt;
    } else if (typeof publishSyncAt === 'string') {
      const parts = publishSyncAt.split(/[- :]/);
      lastSyncTime = new Date(
        parseInt(parts[0]),
        parseInt(parts[1]) - 1,
        parseInt(parts[2]),
        parseInt(parts[3]),
        parseInt(parts[4]),
        parseInt(parts[5])
      );
      // A malformed timestamp (e.g. date-only) yields an Invalid Date whose NaN
      // comparison would silently skip the document forever; re-sync instead.
      if (isNaN(lastSyncTime.getTime())) {
        return { shouldSync: true, reason: 'invalid sync timestamp format' };
      }
    } else {
      return { shouldSync: true, reason: 'invalid sync timestamp format' };
    }
    
    const shouldUpdate = doc.modified.getTime() > lastSyncTime.getTime();
    
    return {
      shouldSync: shouldUpdate,
      reason: shouldUpdate ? 'modified after sync' : 'up to date',
      lastSyncTime,
    };
  } catch {
    return { shouldSync: true, reason: 'error reading existing file' };
  }
}

export function shouldSync(doc: ParsedDocument, outputDir: string): boolean {
  return checkShouldSync(doc, outputDir).shouldSync;
}

export function extractDate(doc: ParsedDocument): Date {
  return doc.date;
}

export function buildPublishedIndex(docs: ParsedDocument[]): Map<string, ParsedDocument> {
  const index = new Map<string, ParsedDocument>();
  for (const doc of docs) {
    index.set(doc.title, doc);
    index.set(doc.slug, doc);
    const aliases = doc.frontmatter.aliases as string[] | undefined;
    if (aliases) {
      for (const alias of aliases) {
        index.set(alias, doc);
      }
    }
  }
  return index;
}

export interface WikilinkResult {
  content: string;
  warnings: string[];
}

export function processWikilinks(
  content: string,
  publishedIndex: Map<string, ParsedDocument>,
  currentDoc: ParsedDocument,
): WikilinkResult {
  const warnings: string[] = [];
   // regex: [[document-name]] or [[document-name|display-text]] pattern matching (excluding ![[image]])
  const wikilinkPattern = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  
  const processed = content.replace(wikilinkPattern, (match, linkTarget: string, displayText?: string) => {
    const display = displayText || linkTarget;
    const targetDoc = publishedIndex.get(linkTarget);
    
    if (targetDoc) {
      return `<a href="/posts/${targetDoc.slug}">${display}</a>`;
    } else {
      warnings.push(`[${currentDoc.title}] Link target "${linkTarget}" is not a published document.`);
      return display;
    }
  });
  
  return { content: processed, warnings };
}

export interface ImageReference {
  filename: string;
  width?: number;
}

export function findImageReferences(content: string): ImageReference[] {
   // regex: ![[filename]] or ![[filename|width]] pattern matching
   const imagePattern = /!\[\[([^\]|]+)(?:\|(\d+))?\]\]/g;
  const images: ImageReference[] = [];
  const seen = new Set<string>();
  
  let match;
  while ((match = imagePattern.exec(content)) !== null) {
    const filename = match[1];
    const widthStr = match[2];
    
    if (!seen.has(filename)) {
      images.push({
        filename,
        width: widthStr ? parseInt(widthStr, 10) : undefined,
      });
      seen.add(filename);
    }
  }
  
  return images;
}

function searchFileInDir(dir: string, targetFilename: string): string | null {
  if (!existsSync(dir)) return null;
  
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        const found = searchFileInDir(fullPath, targetFilename);
        if (found) return found;
      } else if (entry === targetFilename) {
        return fullPath;
      }
    }
  } catch {
    return null;
  }
  
  return null;
}

export function findImageFile(
  filename: string,
  docPath: string,
  sourcePath: string,
): string | null {
  const docName = basename(docPath, '.md');
  const docDir = dirname(docPath);
  
  const priorityPaths = [
    join(docDir, 'assets', docName, filename),
    join(docDir, filename),
    join(sourcePath, 'assets', docName, filename),
    join(sourcePath, 'attachments', filename),
    join(sourcePath, 'images', filename),
    join(sourcePath, 'assets', filename),
  ];
  
  for (const path of priorityPaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  
  return searchFileInDir(sourcePath, filename);
}

export function transformImagePaths(content: string, slug: string): string {
   // regex: ![[filename]] or ![[filename|width]] pattern matching
   const imagePattern = /!\[\[([^\]|]+)(?:\|(\d+))?\]\]/g;
  return content.replace(imagePattern, (_match, filename: string, widthStr?: string) => {
    const width = widthStr ? parseInt(widthStr, 10) : undefined;
    if (width) {
      return `\n\n<figure><img src="/assets/${slug}/${filename}" alt="${filename}" width="${width}" loading="lazy" decoding="async" /></figure>\n\n`;
    }
    return `\n\n![${filename}](/assets/${slug}/${filename})\n\n`;
  });
}

export interface ImageResult {
  content: string;
  warnings: string[];
  images: ImageReference[];
}

export function processImages(
  content: string,
  doc: ParsedDocument,
  sourcePath: string,
): ImageResult {
  const warnings: string[] = [];
  const images = findImageReferences(content);
  
  for (const image of images) {
    const imagePath = findImageFile(image.filename, doc.filePath, sourcePath);
    if (!imagePath) {
      warnings.push(`[${doc.title}] Image "${image.filename}" not found.`);
    }
  }
  
  const transformed = transformImagePaths(content, doc.slug);

  return { content: transformed, warnings, images };
}

export function extractSummaryFromCallout(content: string): string | null {
  // regex: > [!SUMMARY] callout - extracts content for post preview
  const lines = content.split('\n');
  let inSummaryCallout = false;
  const summaryContent: string[] = [];

  for (const line of lines) {
    const calloutStart = line.match(/^>\s*\[!(\w+)\](?:\s+(.*))?$/);

    if (calloutStart) {
      const type = calloutStart[1].toLowerCase();
      if (type === 'summary') {
        inSummaryCallout = true;
        continue;
      } else if (inSummaryCallout) {
        break;
      }
    } else if (inSummaryCallout) {
      if (line.startsWith('>')) {
        summaryContent.push(line.slice(1).trim());
      } else {
        break;
      }
    }
  }

  const result = summaryContent.join(' ').trim();
  return result.length > 0 ? result : null;
}

export function processCallouts(content: string): string {
   // regex: > [!TYPE] or > [!TYPE] title - Obsidian callout syntax
  const lines = content.split('\n');
  const result: string[] = [];
  let inCallout = false;
  let calloutType = '';
  let calloutTitle = '';
  let calloutContent: string[] = [];
  
  for (const line of lines) {
    const calloutStart = line.match(/^>\s*\[!(\w+)\](?:\s+(.*))?$/);
    
    if (calloutStart) {
      if (inCallout) {
        result.push(renderCallout(calloutType, calloutTitle, calloutContent));
        calloutContent = [];
      }
      inCallout = true;
      calloutType = calloutStart[1].toLowerCase();
      calloutTitle = calloutStart[2] || calloutType.toUpperCase();
    } else if (inCallout) {
      if (line.startsWith('>')) {
        calloutContent.push(line.slice(1).trim());
      } else {
        result.push(renderCallout(calloutType, calloutTitle, calloutContent));
        inCallout = false;
        calloutType = '';
        calloutTitle = '';
        calloutContent = [];
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }
  
  if (inCallout) {
    result.push(renderCallout(calloutType, calloutTitle, calloutContent));
  }
  
  return result.join('\n');
}

function renderCallout(type: string, title: string, contentLines: string[]): string {
  const content = contentLines.join('\n').trim();
  return `<div class="callout callout-${type}">
<div class="callout-title">${title}</div>
<div class="callout-content">

${content}

</div>
</div>`;
}

interface CodeBlockProtection {
  content: string;
  blocks: Map<string, string>;
}

function protectCodeBlocks(content: string): CodeBlockProtection {
  const blocks = new Map<string, string>();
  let counter = 0;
  
  let result = content.replace(/```[\s\S]*?```/g, (match) => {
    const placeholder = `__CODE_BLOCK_${counter++}__`;
    blocks.set(placeholder, match);
    return placeholder;
  });
  
  result = result.replace(/`[^`\n]+`/g, (match) => {
    const placeholder = `__INLINE_CODE_${counter++}__`;
    blocks.set(placeholder, match);
    return placeholder;
  });
  
  return { content: result, blocks };
}

function restoreCodeBlocks(content: string, blocks: Map<string, string>): string {
  let result = content;
  for (const [placeholder, original] of blocks) {
    result = result.replace(placeholder, original);
  }
  return result;
}

export function processDocument(
  doc: ParsedDocument,
  publishedIndex: Map<string, ParsedDocument>,
  sourcePath?: string,
): { document: PublishableDocument; warnings: string[]; images: ImageReference[] } {
  const { content: protectedContent, blocks } = protectCodeBlocks(doc.content);
  let processedContent = protectedContent;
  const allWarnings: string[] = [];
  let images: ImageReference[] = [];

  const wikilinkResult = processWikilinks(processedContent, publishedIndex, doc);
  processedContent = wikilinkResult.content;
  allWarnings.push(...wikilinkResult.warnings);

  if (sourcePath) {
    const imageResult = processImages(processedContent, doc, sourcePath);
    processedContent = imageResult.content;
    allWarnings.push(...imageResult.warnings);
    images = imageResult.images;
  }

  processedContent = processCallouts(processedContent);
  processedContent = restoreCodeBlocks(processedContent, blocks);

  return {
    document: { ...doc, processedContent },
    warnings: allWarnings,
    images,
  };
}

export function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function filterExcludedTags(tags: string[], excludeTags?: string[]): string[] {
  if (!excludeTags || excludeTags.length === 0) {
    return tags;
  }
  return tags.filter(tag => !excludeTags.includes(tag));
}

export function generateFrontmatter(doc: PublishableDocument, settings?: Settings): string {
  const dateStr = doc.date.toISOString().split('T')[0];
  const publishSyncAt = formatLocalDateTime(new Date());
  const lang = detectLanguage(doc.content);
  
  let yaml = `title: ${formatYamlString(doc.title)}\ndate: ${dateStr}\npublish: true\npublish_sync_at: "${publishSyncAt}"\nlang: ${lang}`;

  if (doc.frontmatter.tags) {
    const rawTags = doc.frontmatter.tags as string[];
    const tags = filterExcludedTags(rawTags, settings?.posts?.exclude_tags);
    if (tags.length > 0) {
      yaml += '\ntags:\n' + tags.map(t => `  - ${formatYamlString(t)}`).join('\n');
    }
  }
  const summary = doc.frontmatter.summary as string | undefined
    ?? extractSummaryFromCallout(doc.content);
  if (summary) {
    yaml += `\nsummary: ${formatYamlString(summary, { forceQuote: true })}`;
  }
  if (doc.frontmatter.aliases) {
    const aliases = doc.frontmatter.aliases as string[];
    yaml += '\naliases:\n' + aliases.map(a => `  - ${formatYamlString(a)}`).join('\n');
  }
  
  return `---\n${yaml}\n---`;
}

export function saveDocument(doc: PublishableDocument, outputDir: string, settings?: Settings): void {
  const fm = generateFrontmatter(doc, settings);
  const fullContent = `${fm}\n\n${doc.processedContent}`;
  const outputPath = join(outputDir, `${doc.slug}.md`);
  writeFileSync(outputPath, fullContent, 'utf-8');
}

export interface SyncResult {
  synced: ParsedDocument[];
  skipped: Array<{ doc: ParsedDocument; syncInfo: SyncCheckResult }>;
  removed: string[];
  warnings: string[];
  cleanup: CleanupResult;
}

// Decide whether an existing output file is an orphan to remove. Translation files
// (`slug_<lang>.md`, produced by the translate step) are not present in the source
// vault, so they must be kept as long as their base post is still published.
export function isOrphanedOutput(fileSlug: string, publishedSlugs: Set<string>, targetLangs: string[]): boolean {
  if (publishedSlugs.has(fileSlug)) return false;
  const match = /^(.+)_([a-z]{2})$/.exec(fileSlug);
  if (match && targetLangs.includes(match[2]) && publishedSlugs.has(match[1])) return false;
  return true;
}

export async function syncSource(sourcePath: string, outputDir: string, settings?: Settings): Promise<SyncResult> {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  const projectRoot = resolve(outputDir, '..', '..', '..');
  const assetOutputDir = join(projectRoot, 'public', 'assets');
  if (!existsSync(assetOutputDir)) {
    mkdirSync(assetOutputDir, { recursive: true });
  }
  
  const allFiles = findMarkdownFiles(sourcePath);
  const allDocs: ParsedDocument[] = [];
  
  for (const filePath of allFiles) {
    const doc = parseDocument(filePath);
    if (doc) {
      allDocs.push(doc);
    }
  }
  
  const publishable = filterPublishable(allDocs);
  
  const syncResults = new Map<string, SyncCheckResult>();
  for (const doc of publishable) {
    syncResults.set(doc.slug, checkShouldSync(doc, outputDir));
  }
  
  const toSync = publishable.filter(doc => syncResults.get(doc.slug)!.shouldSync);
  const skipped = publishable.filter(doc => !syncResults.get(doc.slug)!.shouldSync);
  
  const publishedSlugs = new Set(publishable.map(d => d.slug));
  const targetLangs = settings?.posts?.translate?.target_langs ?? [];
  const existingFiles = readdirSync(outputDir).filter(f => f.endsWith('.md'));
  const removed: string[] = [];
  for (const file of existingFiles) {
    const slug = basename(file, '.md');
    if (isOrphanedOutput(slug, publishedSlugs, targetLangs)) {
      rmSync(join(outputDir, file));
      removed.push(slug);
    }
  }
  
  const publishedIndex = buildPublishedIndex(publishable);
  const allWarnings: string[] = [];
  
  for (const doc of toSync) {
    // processDocument already extracted the image references; reuse them here.
    const { document, warnings, images } = processDocument(doc, publishedIndex, sourcePath);
    saveDocument(document, outputDir, settings);
    allWarnings.push(...warnings);

    const docAssetDir = join(assetOutputDir, doc.slug);
    if (images.length > 0 && !existsSync(docAssetDir)) {
      mkdirSync(docAssetDir, { recursive: true });
    }

    for (const image of images) {
      const srcPath = findImageFile(image.filename, doc.filePath, sourcePath);
      if (srcPath) {
        try {
          copyFileSync(srcPath, join(docAssetDir, image.filename));
        } catch (error) {
          // One broken image (permissions, dangling symlink, directory collision)
          // must not abort the whole sync run.
          const detail = error instanceof Error ? error.message : String(error);
          allWarnings.push(`[${doc.title}] Failed to copy image "${image.filename}": ${detail}`);
        }
      }
    }
  }
  
  const skippedWithInfo = skipped.map(doc => ({
    doc,
    syncInfo: syncResults.get(doc.slug)!,
  }));
  
  const cleanup = cleanupUnusedImages(outputDir, assetOutputDir);
  
  return { synced: toSync, skipped: skippedWithInfo, removed, warnings: allWarnings, cleanup };
}

export interface CleanupResult {
  removedImages: string[];
  removedDirs: string[];
}

export function cleanupUnusedImages(postsDir: string, assetDir: string): CleanupResult {
  const removedImages: string[] = [];
  const removedDirs: string[] = [];
  
  if (!existsSync(assetDir)) {
    return { removedImages, removedDirs };
  }
  
  const usedImages = new Map<string, Set<string>>();
  
  const postFiles = readdirSync(postsDir).filter(f => f.endsWith('.md'));
  for (const postFile of postFiles) {
    const slug = basename(postFile, '.md');
    const postPath = join(postsDir, postFile);
    const content = readFileSync(postPath, 'utf-8');
    
    const imgTagPattern = /<img[^>]+src="\/assets\/([^"]+)"[^>]*>/g;
    const mdImagePattern = /!\[[^\]]*\]\(\/assets\/([^)]+)\)/g;
    
    const imageSet = new Set<string>();
    
    let match;
    while ((match = imgTagPattern.exec(content)) !== null) {
      const imgPath = match[1];
      const parts = imgPath.split('/');
      if (parts.length === 2 && parts[0] === slug) {
        imageSet.add(parts[1]);
      }
    }
    
    while ((match = mdImagePattern.exec(content)) !== null) {
      const imgPath = match[1];
      const parts = imgPath.split('/');
      if (parts.length === 2 && parts[0] === slug) {
        imageSet.add(parts[1]);
      }
    }
    
    if (imageSet.size > 0) {
      usedImages.set(slug, imageSet);
    }
  }
  
  const assetSubDirs = readdirSync(assetDir).filter(d => {
    const fullPath = join(assetDir, d);
    return statSync(fullPath).isDirectory();
  });
  
  const validSlugs = new Set(postFiles.map(f => basename(f, '.md')));
  
  for (const subDir of assetSubDirs) {
    const subDirPath = join(assetDir, subDir);
    
    if (!validSlugs.has(subDir)) {
      rmSync(subDirPath, { recursive: true });
      removedDirs.push(subDir);
      continue;
    }
    
    const usedInPost = usedImages.get(subDir) || new Set<string>();
    const filesInDir = readdirSync(subDirPath);
    
    for (const file of filesInDir) {
      if (!usedInPost.has(file)) {
        const filePath = join(subDirPath, file);
        rmSync(filePath);
        removedImages.push(`${subDir}/${file}`);
      }
    }
    
    const remainingFiles = readdirSync(subDirPath);
    if (remainingFiles.length === 0) {
      rmSync(subDirPath, { recursive: true });
      removedDirs.push(subDir);
    }
  }
  
  return { removedImages, removedDirs };
}

export function generateRobotsTxt(siteUrl: string): string {
  return `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap-index.xml
`;
}

export function saveRobotsTxt(siteUrl: string, projectRoot: string): void {
  const robotsContent = generateRobotsTxt(siteUrl);
  const robotsPath = join(projectRoot, 'public', 'robots.txt');
  writeFileSync(robotsPath, robotsContent, 'utf-8');
}

export interface CliArgs {
  source?: string;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source' && argv[i + 1]) {
      args.source = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function main() {
  let settings: Settings;
  try {
    settings = loadSettings();
  } catch (error) {
    console.error('❌ Failed to read setting.toml file.');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    console.error('   Please check that the file exists and is properly formatted.');
    process.exit(1);
  }

  const cliArgs = parseCliArgs(process.argv.slice(2));
  const sourcePath = cliArgs.source ?? settings.source_root_path;

  if (!sourcePath) {
    console.error('❌ source_root_path is not configured.');
    console.error('   Please check your setting.toml file or pass --source <path>.');
    process.exit(1);
  }
  
  const resolvedPath = resolve(sourcePath);
  
  if (!existsSync(resolvedPath)) {
    console.error(`❌ Source path does not exist: ${resolvedPath}`);
    process.exit(1);
  }
  
  console.log(`✅ Source path: ${resolvedPath}`);
  console.log('📝 Starting synchronization...');
  
  const outputDir = resolve(import.meta.dirname, '..', 'src', 'content', 'posts');
  const { synced, skipped, removed, warnings, cleanup } = await syncSource(resolvedPath, outputDir, settings);
  
  console.log('');
  
  if (removed.length > 0) {
    console.log(`🗑️  Removed documents (${removed.length}):`);
    for (const slug of removed) {
      console.log(`   📄 ${slug}`);
    }
    console.log('');
  }
  
  if (synced.length > 0) {
    console.log(`✅ Synced documents (${synced.length}):`);
    for (const doc of synced) {
      const modifiedStr = formatLocalDateTime(doc.modified);
      console.log(`   📄 ${doc.title}`);
      console.log(`      Modified: ${modifiedStr}`);
    }
    console.log('');
  }
  
  if (skipped.length > 0) {
    console.log(`⏭️  Skipped documents (${skipped.length}):`);
    for (const { doc, syncInfo } of skipped) {
      const modifiedStr = formatLocalDateTime(doc.modified);
      const lastSyncStr = syncInfo.lastSyncTime ? formatLocalDateTime(syncInfo.lastSyncTime) : 'N/A';
      console.log(`   📄 ${doc.title}`);
      console.log(`      Modified: ${modifiedStr}`);
      console.log(`      Last sync: ${lastSyncStr}`);
      console.log(`      Reason: ${syncInfo.reason}`);
    }
    console.log('');
  }
  
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    for (const warning of warnings) {
      console.log(`   ${warning}`);
    }
    console.log('');
  }
  
  if (cleanup.removedImages.length > 0 || cleanup.removedDirs.length > 0) {
    console.log('🧹 Unused image cleanup:');
    for (const img of cleanup.removedImages) {
      console.log(`   🗑️  ${img}`);
    }
    for (const dir of cleanup.removedDirs) {
      console.log(`   📁 ${dir}/ (empty folder removed)`);
    }
    console.log('');
  }
  
  if (settings.site_url) {
    const projectRoot = resolve(import.meta.dirname, '..');
    saveRobotsTxt(settings.site_url, projectRoot);
    console.log(`🤖 robots.txt generated (Sitemap: ${settings.site_url}/sitemap-index.xml)`);
  } else {
    console.log('⚠️  Warning: site_url is not configured in setting.toml.');
    console.log('   Skipping robots.txt generation. Please set site_url for SEO.');
  }
  
  console.log(`📁 Output path: ${outputDir}`);
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(console.error);
}
