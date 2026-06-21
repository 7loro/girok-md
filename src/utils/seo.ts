// SEO helper utilities: absolute URL resolution, Open Graph locale mapping,
// and plain-text excerpt generation for meta descriptions.

// Resolve a path (absolute or relative) against the configured site origin.
// Falls back to the raw path when `site` is undefined (e.g. site_url unset).
export function toAbsoluteUrl(path: string, site: URL | undefined): string {
  if (!site) return path;
  try {
    return new URL(path, site).href;
  } catch {
    return path;
  }
}

// Build the canonical URL for the current page from its pathname.
export function getCanonicalURL(pathname: string, site: URL | undefined): string {
  return toAbsoluteUrl(pathname, site);
}

// Ensure a path ends with a trailing slash so canonical/hreflang/sitemap/RSS
// URLs agree with Astro's directory build output (e.g. "/posts/foo/").
export function withTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

// Map a language code to an Open Graph locale (e.g. "ko" -> "ko_KR").
export function getOgLocale(lang: string): string {
  const map: Record<string, string> = {
    en: 'en_US',
    ko: 'ko_KR',
  };
  return map[lang] || 'en_US';
}

// Strip Markdown/HTML syntax from content and return a trimmed plain-text
// excerpt suitable for a meta description. Used when no `summary` is present.
export function excerpt(markdown: string, maxLength = 160): string {
  const text = markdown
    .replace(/^---[\s\S]*?---/, '') // frontmatter (defensive)
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`([^`]*)`/g, '$1') // inline code -> keep its text
    .replace(/<[^>]+>/g, ' ') // HTML tags (e.g. synced <figure><img>)
    .replace(/!\[\[[^\]]*\]\]/g, ' ') // Obsidian image embeds
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // Markdown images
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1') // wikilinks -> text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Markdown links -> text
    .replace(/^>\s?\[![^\]]+\][^\n]*/gm, '') // callout headers
    .replace(/^#{1,6}\s+/gm, '') // heading markers
    .replace(/[*_~>#]/g, '') // residual emphasis/blockquote markers
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();

  if (text.length <= maxLength) return text;
  // Cut at the last word boundary within the limit.
  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${sliced.slice(0, lastSpace > 0 ? lastSpace : maxLength).trim()}…`;
}
