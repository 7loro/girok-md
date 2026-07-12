#!/usr/bin/env node
import { parse } from 'smol-toml';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import matter from 'gray-matter';
import { createTranslator } from './translators/index.ts';
import type { Settings, TranslateSettings } from './sync.ts';
import { formatLocalDateTime } from './sync.ts';
import { formatYamlString } from './yamlUtils.ts';

const settingPath = resolve(import.meta.dirname, '..', 'setting.toml');
const postsDir = resolve(import.meta.dirname, '..', 'src', 'content', 'posts');

interface TranslateOptions {
  force?: boolean;
  slug?: string;
}

interface PostFile {
  slug: string;
  lang?: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
  content: string;
  detectedLang?: string; // 콘텐츠 기반으로 감지된 언어
}

/**
 * 텍스트 콘텐츠 기반 언어 감지
 * Unicode 범위: 한글(AC00-D7AF), 히라가나/가타카나(3040-30FF), CJK 한자(4E00-9FFF)
 */
export function detectLanguage(text: string): string {
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[\[.*?\]\]/g, '')
    .replace(/\[\[.*?\]\]/g, '')
    .replace(/#+\s*/g, '')
    .replace(/[*_~`#>\-|]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanText.length === 0) return 'en';

  const koreanChars = (cleanText.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length;
  const japaneseChars = (cleanText.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
  const cjkIdeographs = (cleanText.match(/[\u4E00-\u9FFF]/g) || []).length;
  const englishChars = (cleanText.match(/[a-zA-Z]/g) || []).length;

  const totalChars = cleanText.length;
  const koreanRatio = koreanChars / totalChars;
  const japaneseRatio = japaneseChars / totalChars;
  const cjkRatio = cjkIdeographs / totalChars;
  const englishRatio = englishChars / totalChars;

  if (koreanRatio > 0.1) return 'ko';
  if (japaneseRatio > 0.05) return 'ja';
  if (cjkRatio > 0.1 && japaneseRatio < 0.01) return 'zh';
  if (englishRatio > 0.3) return 'en';

  return 'en';
}

function loadSettings(): Settings & { locale?: string } {
  const content = readFileSync(settingPath, 'utf-8');
  return parse(content) as unknown as Settings & { locale?: string };
}

function parsePostFile(filePath: string, knownLangs?: string[]): PostFile | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const { data, content } = matter(raw);
    const filename = basename(filePath, '.md');

    // Restrict the `_xx` suffix to configured languages so a filename like
    // "notes_db.md" is not misclassified as a translation.
    const langMatch = filename.match(/^(.+)_([a-z]{2})$/);
    if (langMatch && (!knownLangs || knownLangs.includes(langMatch[2]))) {
      return {
        slug: langMatch[1],
        lang: langMatch[2],
        filePath,
        frontmatter: data,
        content,
      };
    }

    // frontmatter에 lang이 있으면 사용, 없으면 감지
    const detectedLang = (data.lang as string) || detectLanguage(content);

    return {
      slug: filename,
      lang: undefined,
      filePath,
      frontmatter: data,
      content,
      detectedLang,
    };
  } catch (error) {
    // Surface the reason so silently skipped posts are debuggable.
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️  Skipping unreadable post ${filePath}: ${detail}`);
    return null;
  }
}

function findPostsToTranslate(
  posts: PostFile[],
  defaultLang: string,
  targetLangs: string[],
  options: TranslateOptions,
): Array<{ source: PostFile; targetLang: string }> {
  const result: Array<{ source: PostFile; targetLang: string }> = [];

  const sourcePosts = posts.filter(p => !p.lang || p.lang === defaultLang);
  const existingTranslations = new Map<string, Set<string>>();

  for (const post of posts) {
    if (post.lang && post.lang !== defaultLang) {
      const langs = existingTranslations.get(post.slug) || new Set();
      langs.add(post.lang);
      existingTranslations.set(post.slug, langs);
    }
  }

  for (const source of sourcePosts) {
    if (options.slug && source.slug !== options.slug) {
      continue;
    }

    const sourceLang = source.detectedLang || defaultLang;

    for (const targetLang of targetLangs) {
      // 원본 언어(감지된 언어 또는 기본 언어)로는 번역하지 않음
      if (targetLang === sourceLang) continue;

      const hasTranslation = existingTranslations.get(source.slug)?.has(targetLang);

      if (options.force || !hasTranslation) {
        result.push({ source, targetLang });
      }
    }
  }

  return result;
}

interface TranslationResult {
  content: string;
  title?: string;
  summary?: string;
}

async function translatePost(
  source: PostFile,
  targetLang: string,
  translateSettings: TranslateSettings,
): Promise<TranslationResult> {
  const translator = createTranslator(translateSettings);
  const sourceLang = source.detectedLang || 'en';
  console.log(`   🔄 Using: ${translator.getName()}`);
  console.log(`   📝 Source language: ${sourceLang}`);

  const result: TranslationResult = {
    content: await translator.translate(source.content, sourceLang, targetLang),
  };

  const originalTitle = source.frontmatter.title as string | undefined;
  if (originalTitle) {
    result.title = await translator.translate(originalTitle, sourceLang, targetLang);
  }

  const originalSummary = (source.frontmatter.summary || source.frontmatter.description) as string | undefined;
  if (originalSummary) {
    result.summary = await translator.translate(originalSummary, sourceLang, targetLang);
  }

  return result;
}

interface TranslatedFrontmatterOptions {
  translatedTitle?: string;
  translatedSummary?: string;
}

function generateTranslatedFrontmatter(
  originalFrontmatter: Record<string, unknown>,
  targetLang: string,
  sourceSlug: string,
  options: TranslatedFrontmatterOptions = {},
): string {
  const fm: Record<string, unknown> = { ...originalFrontmatter };

  if (options.translatedTitle) {
    fm.title = options.translatedTitle;
  }
  if (options.translatedSummary) {
    if (fm.summary !== undefined) {
      fm.summary = options.translatedSummary;
    } else if (fm.description !== undefined) {
      fm.description = options.translatedSummary;
    }
  }

  fm.lang = targetLang;
  fm.translated_from = sourceSlug;
  fm.translate_sync_at = formatLocalDateTime(new Date());

  delete fm.publish_sync_at;

  const lines: string[] = [];
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${typeof item === 'string' ? formatYamlString(item) : String(item)}`);
      }
    } else if (value instanceof Date) {
      lines.push(`${key}: ${value.toISOString().split('T')[0]}`);
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${formatYamlString(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  return `---\n${lines.join('\n')}\n---`;
}

function saveTranslatedPost(
  source: PostFile,
  translation: TranslationResult,
  targetLang: string,
): string {
  const frontmatter = generateTranslatedFrontmatter(source.frontmatter, targetLang, source.slug, {
    translatedTitle: translation.title,
    translatedSummary: translation.summary,
  });
  const fullContent = `${frontmatter}\n\n${translation.content}`;

  const outputFilename = `${source.slug}_${targetLang}.md`;
  const outputPath = join(postsDir, outputFilename);
  writeFileSync(outputPath, fullContent, 'utf-8');

  return outputPath;
}

function parseArgs(): TranslateOptions {
  const args = process.argv.slice(2);
  const options: TranslateOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--force' || args[i] === '-f') {
      options.force = true;
    } else if ((args[i] === '--slug' || args[i] === '-s') && args[i + 1]) {
      options.slug = args[i + 1];
      i++;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  let settings: Settings & { locale?: string };
  try {
    settings = loadSettings();
  } catch (error) {
    console.error('❌ Failed to read setting.toml file.');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const translateSettings = settings.posts?.translate;
  if (!translateSettings?.enabled) {
    console.error('❌ Translation is not enabled.');
    console.error('   Set [posts.translate] enabled = true in setting.toml');
    process.exit(1);
  }

  const defaultLang = settings.locale || 'en';
  const targetLangs = translateSettings.target_langs || [];

  if (targetLangs.length === 0) {
    console.error('❌ No target languages configured.');
    console.error('   Set target_langs in [posts.translate] section.');
    process.exit(1);
  }

  console.log(`📝 Translation Settings:`);
  console.log(`   Default language: ${defaultLang}`);
  console.log(`   Target languages: ${targetLangs.join(', ')}`);
  console.log('');

  if (!existsSync(postsDir)) {
    console.error(`❌ Posts directory not found: ${postsDir}`);
    console.error('   Run "npm run sync" first.');
    process.exit(1);
  }

  const knownLangs = [defaultLang, ...targetLangs];
  const postFiles = readdirSync(postsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => parsePostFile(join(postsDir, f), knownLangs))
    .filter((p): p is PostFile => p !== null);

  console.log(`📚 Found ${postFiles.length} post files`);

  const toTranslate = findPostsToTranslate(postFiles, defaultLang, targetLangs, options);

  if (toTranslate.length === 0) {
    console.log('✅ All posts are already translated.');
    return;
  }

  console.log(`🔄 Posts to translate: ${toTranslate.length}`);
  console.log('');

  let successCount = 0;
  let errorCount = 0;

  for (const { source, targetLang } of toTranslate) {
    console.log(`📄 Translating: ${source.slug} → ${targetLang}`);

    try {
      const translation = await translatePost(source, targetLang, translateSettings);
      const outputPath = saveTranslatedPost(source, translation, targetLang);
      console.log(`   ✅ Saved: ${basename(outputPath)}`);
      successCount++;
    } catch (error) {
      console.error(`   ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      errorCount++;
    }

    console.log('');
  }

  console.log('📊 Translation Summary:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(console.error);
}
