import { withTrailingSlash } from './seo';

// Normalize a configured base path so it always ends with a single trailing
// slash, ready to be concatenated with route segments (e.g. `${baseUrl}posts`).
export function normalizeBaseUrl(base: string): string {
  return withTrailingSlash(base);
}

// Read Astro's configured BASE_URL and return it normalized with a trailing
// slash. Replaces the `base.endsWith('/') ? base : `${base}/`` pattern that was
// duplicated across pages, layouts, and components.
export function getBaseUrl(): string {
  return normalizeBaseUrl(import.meta.env.BASE_URL);
}
