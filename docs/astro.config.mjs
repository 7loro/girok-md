import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://7loro.github.io',
  base: '/girok-md',
  integrations: [
    sitemap(),
    starlight({
      title: 'girok-md',
      logo: {
        light: './public/logo-light.svg',
        dark: './public/logo-dark.svg',
        replacesTitle: true,
      },
      social: {
        github: 'https://github.com/7loro/girok-md',
      },
      defaultLocale: 'root',
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
        ko: {
          label: '한국어',
          lang: 'ko',
        },
      },
      sidebar: [
        {
          label: 'Getting Started',
          translations: { ko: '시작하기' },
          items: [
            { label: 'Introduction', slug: 'index', translations: { ko: '소개' } },
            { label: 'Quick Start', slug: 'quick-start', translations: { ko: '빠른 시작' } },
            { label: 'Configuration', slug: 'configuration', translations: { ko: '설정' } },
          ],
        },
        {
          label: 'Guides',
          translations: { ko: '가이드' },
          items: [
            { label: 'Writing Posts', slug: 'guides/writing-posts', translations: { ko: '포스트 작성' } },
            { label: 'Markdown Syntax', slug: 'guides/markdown-syntax', translations: { ko: '마크다운 문법' } },
            { label: 'Post Translation', slug: 'guides/translation', translations: { ko: '포스트 번역' } },
            { label: 'Deployment', slug: 'guides/deployment', translations: { ko: '배포' } },
          ],
        },
        {
          label: 'Reference',
          translations: { ko: '참조' },
          items: [
            { label: 'Commands', slug: 'reference/commands', translations: { ko: '명령어' } },
            { label: 'Project Structure', slug: 'reference/project-structure', translations: { ko: '프로젝트 구조' } },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
      editLink: {
        baseUrl: 'https://github.com/7loro/girok-md/edit/main/docs/',
      },
    }),
  ],
});
