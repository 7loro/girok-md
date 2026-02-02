# girok.md (기록.md)

> **Your record becomes a map for others.**

*Read this in other languages: [English](README.md), [한국어](README.ko.md)*

An open-source static blog generator that transforms your markdown files into a beautiful blog.

<p align="center">
  <img src=".github/screenshot.png" alt="girok.md Screenshot" width="800">
</p>

[![Astro](https://img.shields.io/badge/Astro-5.x-BC52EE?logo=astro&logoColor=white)](https://astro.build)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## Philosophy

**The Power of Recording**

- **Personal Records**: Traces left behind so I don't forget what I've learned.
- **Shared Records**: Milestones from my journey that help others grow.

Your notes are more than personal memos—they become a map that guides someone else's path.

---

## Features

- **Markdown Native**: Full support for Wikilinks, image embeds, and Callouts
- **Incremental Sync**: Only syncs changed files based on `publish_sync_at` timestamp
- **Full-Text Search**: Client-side search powered by Pagefind
- **Tag System**: Browse and filter posts by tags
- **Reading Time**: Estimated reading time for each post (supports Korean and English)
- **Dark/Light Theme**: System preference detection with manual toggle
- **SEO Optimized**: Auto-generated sitemap and meta tags
- **GitHub Pages**: One-click deployment support
- **Comments**: Giscus-powered comments via GitHub Discussions
- **View Count**: Privacy-friendly page view tracking via GoatCounter

## Documentation

📖 For detailed usage instructions and guides, visit the **[Official Documentation](https://7loro.github.io/girok-md/)**.

## Quick Start

### 1. Create Your Repository

Click the **Use this template** button at the top of this page to create your own repository.

> **Tip**: Name your repository `username.github.io` (e.g., `7loro.github.io`) for easy GitHub Pages deployment.

### 2. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_USERNAME.github.io.git
cd YOUR_USERNAME.github.io
npm install
```

### 3. Configuration

Edit the `setting.toml` file:

```toml
# Absolute path to your markdown files
source_root_path = "/path/to/your/markdown/folder"

# Blog name
blog_name = "My Blog"

# Site URL (for SEO)
site_url = "https://your-username.github.io"
```

### 4. Sync and Run

```bash
# Sync posts from your markdown folder
npm run sync

# Start development server
npm run dev
```

Visit http://localhost:4321 to see your blog.

## Writing Posts

Add `publish: true` to your document's frontmatter to publish it to your blog.

```yaml
---
title: Post Title
publish: true
tags: [astro, blog]
description: Post description (optional)
---

Write your content here.
```

### Supported Markdown Syntax

| Syntax | Example | Result |
|--------|---------|--------|
| Wikilinks | `[[Document]]` | Internal link |
| Aliased Links | `[[Document\|Display Text]]` | Custom text link |
| Image Embeds | `![[image.png]]` | Image tag |
| Callouts | `> [!NOTE]` | Styled callout box |

## Project Structure

```
.
├── src/
│   ├── components/       # Astro components
│   │   ├── Search.astro      # Pagefind search
│   │   ├── ThemeToggle.astro # Theme switcher
│   │   ├── TOC.astro         # Table of contents
│   │   └── TagList.astro     # Tag list
│   ├── layouts/          # Layouts
│   ├── pages/            # Routes
│   │   ├── index.astro       # Home
│   │   ├── posts/            # Post pages
│   │   └── tags/             # Tag pages
│   ├── content/
│   │   └── posts/        # Synced posts (auto-generated)
│   ├── styles/           # Global CSS
│   └── utils/            # Utilities
├── scripts/
│   └── sync.ts           # Markdown sync script
├── public/               # Static files
├── setting.toml          # Blog configuration
└── astro.config.mjs      # Astro configuration
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (localhost:4321) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run sync` | Sync from markdown folder |
| `npm test` | Run tests |

## Deployment

### GitHub Pages

Create `.github/workflows/deploy.yml` file in your repository:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Then configure GitHub Pages:

1. Name your repository `username.github.io` (if you haven't already)
2. Go to Repository **Settings > Pages > Source**: select "GitHub Actions"
3. Push to `main` branch to trigger automatic deployment
4. Your blog will be available at `https://username.github.io`

The workflow automatically builds and deploys your blog on every push to the `main` branch. You can also trigger deployment manually from the **Actions** tab.

### Manual Build

```bash
npm run build
# Upload the dist/ folder to your web server
```

## Comments

Enable comments on your blog posts using [Giscus](https://giscus.app), a comments system powered by GitHub Discussions.

### Setup

1. Visit [giscus.app](https://giscus.app) and configure your repository
2. Copy the generated values to `setting.toml`:

```toml
[comments]
enabled = true
provider = "giscus"

[comments.giscus]
repo = "username/repo"
repo_id = "R_..."
category = "Announcements"
category_id = "DIC_..."
mapping = "pathname"
strict = "0"
reactions_enabled = "1"
emit_metadata = "0"
input_position = "top"
theme = "preferred_color_scheme"
lang = "en"
```

> **Note**: Your repository must have GitHub Discussions enabled. Go to **Settings > Features > Discussions** to enable it.

## Analytics (View Count)

Track page views and display view counts on your posts using [GoatCounter](https://goatcounter.com), a privacy-friendly analytics platform that doesn't use cookies.

### Setup

1. Create a free account at [goatcounter.com](https://goatcounter.com)
2. Note your site code (e.g., `mysite` from `mysite.goatcounter.com`)
3. **Enable Public Counter API** (required for view counts):
   - Go to your GoatCounter dashboard (e.g., `mysite.goatcounter.com`)
   - Navigate to **Settings** (top menu)
   - Find **"Allow adding visitor counts on your website"** checkbox
   - Enable it and click **Save**
4. Configure in `setting.toml`:

```toml
[analytics]
enabled = true
provider = "goatcounter"

[analytics.goatcounter]
site_code = "your-site-code"
show_view_count = true
```

### Options

| Option | Description |
|--------|-------------|
| `enabled` | Enable/disable analytics tracking |
| `site_code` | Your GoatCounter site code |
| `show_view_count` | Show view count on post pages |

> **Note**: View counts are fetched client-side from GoatCounter's public API. Counts may take a few minutes to update after page visits.

### Troubleshooting

**View counts not showing?**
- Ensure **"Allow adding visitor counts on your website"** is enabled in GoatCounter Settings
- Verify your `site_code` matches your GoatCounter subdomain exactly
- Check browser console for CORS or API errors

## Sync Logic

The sync process works incrementally:

1. Only documents with `publish: true` are included
2. Compares document's `modified` time with `publish_sync_at`
3. Only syncs changed documents for optimized build times
4. Automatically removes documents that are deleted or set to `publish: false`

## Tech Stack

- **Framework**: [Astro](https://astro.build) 5.x
- **Language**: TypeScript (strict mode)
- **Markdown**: remark, rehype
- **Search**: [Pagefind](https://pagefind.app)
- **Testing**: Vitest, Playwright

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE)
