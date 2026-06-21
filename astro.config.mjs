import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { parse } from 'smol-toml';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const settingPath = join(__dirname, 'setting.toml');
const settingContent = readFileSync(settingPath, 'utf-8');
const settings = parse(settingContent);

// Build slug → date mapping table from post markdown files
const postsDir = join(__dirname, 'src/content/posts');
const postDateMap = new Map();
// Guard against a missing posts dir (fresh clone / before `npm run sync`).
if (existsSync(postsDir)) {
  for (const file of readdirSync(postsDir).filter(f => f.endsWith('.md'))) {
    const content = readFileSync(join(postsDir, file), 'utf-8');
    const { data } = matter(content);
    if (data.date && data.publish) {
      const slug = file.replace(/\.md$/, '');
      postDateMap.set(slug, new Date(data.date).toISOString());
    }
  }
}

if (!settings.site_url) {
  console.warn('⚠️  Warning: site_url is not configured in setting.toml.');
  console.warn('   Please set site_url for SEO. (e.g., site_url = "https://7loro.github.io")');
}

// rehype plugin: add native lazy-loading and async decoding to content images
// (improves Core Web Vitals / LCP without changing markup).
function rehypeImageAttrs() {
  return (tree) => {
    const visit = (node) => {
      if (node.type === 'element' && node.tagName === 'img') {
        node.properties = node.properties || {};
        if (!('loading' in node.properties)) node.properties.loading = 'lazy';
        if (!('decoding' in node.properties)) node.properties.decoding = 'async';
      }
      if (Array.isArray(node.children)) node.children.forEach(visit);
    };
    visit(tree);
  };
}

export default defineConfig({
  site: settings.site_url,
  base: '/',
  markdown: {
    rehypePlugins: [rehypeImageAttrs],
  },
  integrations: [
    sitemap({
      serialize(item) {
        // Map frontmatter date to lastmod for /posts/ URLs
        const match = item.url.match(/\/posts\/(.+?)\/?$/);
        if (match) {
          const slug = decodeURIComponent(match[1]);
          const lastmod = postDateMap.get(slug);
          if (lastmod) {
            item.lastmod = lastmod;
          }
        }
        return item;
      },
    }),
  ],
  vite: {
    define: {
      'import.meta.env.BLOG_NAME': JSON.stringify(settings.blog_name),
      'import.meta.env.LOCALE': JSON.stringify(settings.locale || 'en'),
      'import.meta.env.INTRO': JSON.stringify(settings.intro || {}),
      'import.meta.env.COMMENTS': JSON.stringify(settings.comments || { enabled: false }),
      'import.meta.env.ANALYTICS': JSON.stringify(settings.analytics || { enabled: false }),
    },
  },
});
