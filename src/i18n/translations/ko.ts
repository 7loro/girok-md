import type { TranslationKey } from './en';

export const ko: Record<TranslationKey, string> = {
  // Common
  posts: '포스트',
  post: '포스트',
  tags: '태그',
  tag: '태그',
  backToList: '목록으로',
  viewAll: '전체 보기',

  // Posts page
  postsPageTitle: '포스트',
  postsPageSubtitle: '{count}개의 포스트',

  // Tags page
  tagsPageTitle: '태그',
  tagsPageSubtitle: '{count}개의 태그',
  tagPageTitle: '태그: {tag}',
  tagPostsCount: '{count}개의 포스트',
  noPostsInTag: '이 태그의 포스트가 없습니다.',
  backToTags: '← 태그 목록',

  // Home
  recentPosts: '최근 포스트',
  viewAllPosts: '모든 글 보기 →',

  // Search
  search: '검색',
  openSearch: '검색 열기',
  closeSearch: '검색 닫기',

  // Theme toggle
  themeToggle: '테마 전환',
  switchToLight: '라이트 모드로 전환',
  switchToDark: '다크 모드로 전환',

  // Design theme selector
  designTheme: '디자인 테마',
  selectDesignTheme: '디자인 테마 선택',
  designThemeList: '디자인 테마 목록',
  material: 'Material',
  materialDesc: '깔끔한 그림자와 부드러운 모서리',
  neoBrutalism: 'Neo-Brutalism',
  neoBrutalismDesc: '두꺼운 테두리와 하드 섀도우',
  glassmorphism: 'Glassmorphism',
  glassmorphismDesc: '반투명 유리 효과',

  // TOC
  tableOfContents: '목차',
  toggleToc: '목차 토글',

  // Layout
  defaultDescription: '마크다운 블로그',

  // Accessibility
  mainNavigation: '메인 내비게이션',
  skipToContent: '본문으로 건너뛰기',

  // Date locale
  dateLocale: 'ko-KR',

  // Comments
  comments: '댓글',

  // Reading time
  readingTime: '{minutes}분',

  // View count
  views: '조회',

  // 404
  notFoundTitle: '페이지를 찾을 수 없습니다',
  notFoundMessage: '찾으시는 페이지가 존재하지 않거나 이동되었습니다.',
  goHome: '홈으로',
};
