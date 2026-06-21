import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getPostsForLocale, getPostUrl } from '../utils/i18nRouting';
import { excerpt, withTrailingSlash } from '../utils/seo';

// Escape the five XML predefined entities for safe inclusion in the feed.
const escapeXml = (str: string): string => {
  const entities: Record<string, string> = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  };
  return str.replace(/[<>&'"]/g, (char) => entities[char] ?? char);
};

// RSS 2.0 feed for the default-locale posts.
export const GET: APIRoute = async ({ site }) => {
  const blogName = import.meta.env.BLOG_NAME || 'My Blog';
  const intro = import.meta.env.INTRO || {};
  const language = import.meta.env.LOCALE || 'en';
  const channelDescription = intro.description ? String(intro.description).replace(/\n/g, ' ').trim() : blogName;

  const base = import.meta.env.BASE_URL;
  const baseUrl = base.endsWith('/') ? base : `${base}/`;
  const toAbsolute = (path: string): string => (site ? new URL(path, site).href : path);

  const allPosts = await getCollection('posts');
  const posts = getPostsForLocale(allPosts).sort(
    (a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime(),
  );

  const items = posts
    .map((post) => {
      const link = toAbsolute(withTrailingSlash(getPostUrl(post, baseUrl)));
      const description = post.data.summary ?? excerpt(post.body);
      return `    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${new Date(post.data.date).toUTCString()}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(blogName)}</title>
    <link>${escapeXml(toAbsolute(baseUrl))}</link>
    <description>${escapeXml(channelDescription)}</description>
    <language>${escapeXml(language)}</language>
    <atom:link href="${escapeXml(toAbsolute(`${baseUrl}rss.xml`))}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
