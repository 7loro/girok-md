# Design: Read-only markdown preview in dashboard Documents page

Date: 2026-07-13
Status: Approved

## Problem

The dashboard lists documents but offers no way to read their content. Users
must open the vault or the published site to see what a document says.

## Decision

Server-side rendering reusing the sync pipeline, shown in an expanding side
panel on the Documents page (user-confirmed over modal / separate page).

## Server

- `GET /api/docs/:slug/preview` → `{ title, html }`.
- Lookup by slug only — no client-supplied paths, so no path traversal.
- Source file exists → `parseDocument` + `processDocument` (wikilinks, image
  embeds, callouts — same transforms sync applies), so drafts and modified
  docs preview as they would publish.
- Orphaned docs (no source) → render the synced output file's content.
- Markdown → HTML via existing deps: `remark-parse` → `remark-gfm` →
  `remark-rehype` → `rehype-stringify`. Raw HTML stays disabled (default), so
  embedded HTML is dropped, not executed.
- Serve `public/` statically as a fallback after the SPA bundle so
  `/assets/<image>` resolves for previews (SPA's own `/assets/*` JS/CSS take
  precedence; Hono's serveStatic falls through on miss).
- Errors: unknown slug → 404; render failure → 500 with message.

## Web UI

- Selecting a row opens one wide side panel (~2× the table width) that shows
  status badge, publish toggle, metadata, warnings, and the rendered HTML
  below a divider (read-only, `dangerouslySetInnerHTML` — content is
  same-origin, raw HTML already stripped server-side). The preview loads
  immediately on selection; no separate Preview button (user-revised
  2026-07-13, superseding the original button-triggered design).
- Close deselects; selecting another doc loads that doc's preview.
- `theme.css` gains `.preview-body` typography (headings, code, blockquote,
  `img { max-width: 100% }`).

## Testing

- Unit tests for the pure markdown→HTML render function: GFM table, fenced
  code, image tag output.
- Endpoint tests: auth required, 404 on unknown slug.
