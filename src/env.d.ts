/// <reference types="astro/client" />

import type { IntroConfig, CommentsConfig, AnalyticsConfig } from './types/settings';

declare global {
  interface ImportMetaEnv {
    readonly BLOG_NAME: string;
    readonly LOCALE: 'en' | 'ko';
    readonly INTRO: IntroConfig;
    readonly COMMENTS: CommentsConfig;
    readonly ANALYTICS: AnalyticsConfig;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
