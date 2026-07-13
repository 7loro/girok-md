---
title: Building a Static Blog with Obsidian Markdown
date: 2026-01-31
publish: true
lang: en
tags:
  - personal
  - obsidian
  - blog
summary: "While I've been taking notes with Obsidian for several years, I've felt uncomfortable sharing my writing, and I've been thinking about creating a blog using my notes. There are many tools that turn Markdown into a static page, but I wanted to create my own tool and add the features I wanted, so I created my own instead of using existing solutions. I created `girok.md (record.md)`, which can be published as a blog post by adding `publish: true` to the frontmatter of the Markdown document."
translated_from: obsidian-마크다운-정적-블로그-구축
translate_sync_at: "2026-02-05 02:08:26"
---

<div class="callout callout-summary">
<div class="callout-title">SUMMARY</div>
<div class="callout-content">

While I've been taking notes with Obsidian for several years, I've felt uncomfortable sharing my writing, and I've been thinking about creating a blog using my notes. There are many tools that turn Markdown into a static page, but I wanted to create my own tool and add the features I wanted, so I created my own instead of using existing solutions. I created `girok.md (record.md)`, which can be published as a blog post by adding `publish: true` to the frontmatter of the Markdown document.

</div>
</div>

## Why did you make it?

As I've been taking notes with Obsidian for several years, I've become increasingly uncomfortable sharing my writing. Of course, it is not difficult to share individual documents through various existing plugins. But I wanted more.

**I wanted to select only the things I wanted to share from my notes and collect them in one place.** Rather than sending individual links one by one, I wanted to show my writings in one space like a blog. I knew there were various solutions, including Jekyll, Gatsby, and Obsidian Publish. But I wanted to create my own tool that fit my workflow.

**Note-taking may end up being a personal activity.** However, I believe that the writing becomes truly meaningful once you go through the “publishing” process of refining, polishing, and sharing those notes. In the process of organizing what I have learned, my understanding deepens, and sharing it can help someone else.

So, I created `record.md (girok.md)`, which can be published as a blog post by adding `publish: true` to the frontmatter of the Markdown document.

- [record.md github](https://github.com/7loro/girok-md)
- [How to use record.md](https://7loro.github.io/girok-md/)

## How to use it

1. Write at Obsidian
2. Add `publish: true` to frontmatter
3. Execute the `npm run sync` command.
4. If you make a commit and push it, it will be automatically distributed

## Main features

### Obsidian grammar as is

There is no need to modify it separately for blogging.

- **Wikilinks**: `[[other document]]`, `[[document|display text]]` → Automatically convert internal links
- **Image Embed**: `![[image.png]]` → automatically copied and path converted
- **Callouts**: `> [!NOTE]`, `> [!WARNING]` → Render as styled boxes.

### Incremental synchronization

It doesn't sync all your documents every time. `publish_sync_at` compares timestamps and synchronizes **only modified documents**, resulting in fast build times.

### Full text search (Pagefind)

You can open the search bar with `Cmd+K` (Mac) or `Ctrl+K` (Windows). Full-text search is possible on the client side without a server, and Korean is also well supported.

### Tag system

You can filter posts by tag, and tag colors are automatically generated based on a hash function. Identical tags always appear in the same color to maintain consistency.

### TOC (Table of Contents)

This is useful when reading long texts. There is a fixed table of contents on the right, so clicking on it takes you directly to that section, and the section you're currently viewing is highlighted each time you scroll.

### Dark/Light Mode

You can switch themes with the sun/moon icon in the header. It detects your system settings and saves them to localStorage so they remain there the next time you visit.

### Mobile Optimization

The layout automatically adjusts depending on the screen size. 3 rows of desktops, 2 rows of tablets, 1 row of mobile devices. It looks good even on small screens like the iPhone SE.

### Comments (Giscus)

It is a comment system based on GitHub Discussions. Once you set it up, the comment function is automatically added to each post.

### GoatCounter

Privacy-friendly view tracking. We do not use cookies and can display the number of views for each post.

### Display reading time

The estimated reading time is automatically calculated based on the length of the article. (English: 200 WPM, Korean: 500 CPM, excluding code blocks/images/links)

### SEO Optimization

Sitemap and meta tags are automatically created, and robots.txt is also managed.

## Comparison with existing solutions

| Item | girok.md | Jekyll | Gatsby | Obsidian Publishing |
|------|----------|--------|--------|------------------|
| **Price** | Free (GitHub Pages) | Free (GitHub Pages) | Free (Netlify, etc.) | $10 per month |
| **Obsidian Grammar** | ✅ Native support | ❌ Separate conversion required | ❌ Plugin required | ✅ Full support |
| **Wikilinks** | ✅ Automatic conversion | ❌ Not supported | ⚠️ Plugin dependent | ✅ Support |
| **Callouts** | ✅ Support | ❌ Not supported | ❌ Not supported | ✅ Support |
| **Setting Difficulty** | Low (TOML one) | middle | High (React/GraphQL) | very low |
| **Build Speed** | Fast (Astro) | Medium (Ruby) | slow | N/A |
| **Customization** | ✅ Completely free | ✅ Available | ✅ Available | ⚠️ Limited |
| **Search** | Pagefind (free) | Direct implementation | Algolia (paid) | ✅ Built-in |
| **Hosting** | GitHub Pages, etc. | GitHub Pages, etc. | Vercel, Netlify, etc. | Obsidian Server |

### When should I choose girok.md?

- If you are **Obsidian user** and want to share your notes on your blog
- When you want to operate for **free** (using GitHub Pages)
- Wikilinks, Callouts, etc. **When you want to use Obsidian grammar as is**
- When you want to **customize yourself**
- When the complex settings of Jekyll/Gatsby are burdensome

## What was it made of?

- **Astro**: Static site generator. It is lighter than Next.js and is specialized for Markdown blogs. The build is also fast.
- **Pagefind**: A search engine that works without a server. Algolia is paid, but this one is free and works well in Korean.
- **GitHub Pages**: Free hosting. If you push, it will be automatically distributed and HTTPS will be automatically installed.

Actually, I'm an app developer so I don't know much about the web. Instead, we actively used [OpenCode](https://github.com/opencode-ai/opencode) + [oh-my-opencode](https://github.com/pinkroosterai/oh-my-opencode) and Anthropic models (Claude Opus 4.5, Sonnet 4.5). Thanks to AI coding tools, we were able to quickly create even unfamiliar areas.

## How it works

```
Obsidian Vault (publish: true document)
    ↓ npm run sync
Conversion (Wikilinks → HTML, Copy Images, Callouts Conversion)
    ↓ Astro Build
static html
    ↓ GitHub Actions
GitHub Pages (distribution)
```

`npm run sync` is the key. If you set a path where Markdown documents are gathered in `setting.toml`, it finds documents with `publish: true` in that path and converts Wikilinks, images, and callouts. Astro then builds it as static HTML, pushes it, and GitHub Actions automatically deploys it.

## Getting started

The code is publicly available on GitHub: https://github.com/7loro/girok-md

### Preparation

- **Node.js 18+**: Install LTS version from [nodejs.org](https://nodejs.org/)
- **Git**: Install from [git-scm.com](https://git-scm.com/)
- **GitHub account**: Required for deployment

<div class="callout callout-tip">
<div class="callout-title">TIP</div>
<div class="callout-content">

You can check whether it is installed by typing `node -v` and `npm -v` in the terminal.

</div>
</div>

### Installation

```bash
git clone https://github.com/7loro/girok-md.git
cd girok-md
npm install
```

### Settings

Open `setting.toml` and modify it to suit your environment:

```toml
# Absolute path to the folder containing the Markdown document
source_root_path = "/Users/yourname/Documents/ObsidianVault"

# blog name
blog_name = "My Blog"

# Site URL to be deployed (when using GitHub Pages)
site_url = "https://your-username.github.io"
```

### Local testing

```bash
npm run sync # sync publish: true documents from vault
npm run dev # preview at http://localhost:4321
```

### Deployment (GitHub Pages)

1. Click the **Use this template** button in [girok-md](https://github.com/7loro/girok-md)
2. Enter the Repository name in the format `username.github.io` (e.g. `7loro.github.io`)
3. Clone the created repository: `git clone https://github.com/YOUR_USERNAME/YOUR_USERNAME.github.io.git`
4. In your repository **Settings → Pages → Source**, select “GitHub Actions”
5. Once you commit and push your changes, they will be automatically built and deployed.

```bash
git add .
git commit -m "Add new post"
git push
```

<div class="callout callout-note">
<div class="callout-title">NOTE</div>
<div class="callout-content">

Once deployment is complete, you can check the blog at `https://username.github.io`.

</div>
</div>

## Retrospective

Actually, I've created a static blog with Markdown before. By watching several YouTube videos and learning a bit about next.js and react, I manually created the core functions of importing markdown files, converting the necessary grammar, displaying in the list of posts, and reading posts. I made them one by one, but I didn't know much about the web and it took a lot of time.

As the era of Vibe coding entered, I wanted to create something to keep up with AI technologies, and I was surprised a lot while using OpenCode and oh-my-opencode. Of course, you can’t just say, “Create a blog.” Because I had a clear workflow I wanted, it was easy to plan and proceed accordingly.

What was especially fun was watching the agents directly perform browser tests using Playwright MCP, fix any issues they find, and test again. It was amazing to see not only the development but also the verification process running automatically. I felt that now was the time to make the necessary tools yourself.

After making it to suit my workflow, it became quite useful, so I decided to release it as open source. I would be really happy if many people use and develop it together.