// Shared configuration types sourced from setting.toml and injected into
// import.meta.env by astro.config.mjs (BLOG_NAME, LOCALE, INTRO, COMMENTS,
// ANALYTICS). Kept in one place so components consume them without re-declaring
// or casting import.meta.env values.

export interface IntroConfig {
  name?: string;
  role?: string;
  greeting?: string;
  description?: string;
  intro_tags?: string[];
}

export interface GiscusConfig {
  repo: string;
  repo_id: string;
  category: string;
  category_id: string;
  mapping: string;
  strict: string;
  reactions_enabled: string;
  emit_metadata: string;
  input_position: string;
  theme: string;
  lang: string;
}

export interface CommentsConfig {
  enabled: boolean;
  provider: string;
  giscus?: GiscusConfig;
}

export interface GoatCounterConfig {
  site_code: string;
  show_view_count: boolean;
}

export interface AnalyticsConfig {
  enabled: boolean;
  provider: string;
  goatcounter?: GoatCounterConfig;
}
