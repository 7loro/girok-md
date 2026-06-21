export const en = {
  // Common
  posts: 'Posts',
  post: 'Post',
  tags: 'Tags',
  tag: 'Tag',
  backToList: 'Back to list',
  viewAll: 'View all',

  // Posts page
  postsPageTitle: 'Posts',
  postsPageSubtitle: '{count} posts',

  // Tags page
  tagsPageTitle: 'Tags',
  tagsPageSubtitle: '{count} tags',
  tagPageTitle: 'Tag: {tag}',
  tagPostsCount: '{count} posts',
  noPostsInTag: 'No posts with this tag.',
  backToTags: '← Tags',

  // Home
  recentPosts: 'Recent Posts',
  viewAllPosts: 'View all posts →',

  // Search
  search: 'Search',
  openSearch: 'Open search',
  closeSearch: 'Close search',

  // Theme toggle
  themeToggle: 'Toggle theme',
  switchToLight: 'Switch to light mode',
  switchToDark: 'Switch to dark mode',

  // Design theme selector
  designTheme: 'Design theme',
  selectDesignTheme: 'Select design theme',
  designThemeList: 'Design theme list',
  material: 'Material',
  materialDesc: 'Clean shadows and soft corners',
  neoBrutalism: 'Neo-Brutalism',
  neoBrutalismDesc: 'Bold borders and hard shadows',
  glassmorphism: 'Glassmorphism',
  glassmorphismDesc: 'Translucent glass effect',

  // TOC
  tableOfContents: 'Contents',
  toggleToc: 'Toggle table of contents',

  // Layout
  defaultDescription: 'A markdown blog',

  // Accessibility
  mainNavigation: 'Main navigation',
  skipToContent: 'Skip to content',

  // Date locale
  dateLocale: 'en-US',

  // Comments
  comments: 'Comments',

  // Reading time
  readingTime: '{minutes} min read',

  // View count
  views: 'views',

  // 404
  notFoundTitle: 'Page not found',
  notFoundMessage: "The page you're looking for doesn't exist or has been moved.",
  goHome: 'Go home',
} as const;

export type TranslationKey = keyof typeof en;
