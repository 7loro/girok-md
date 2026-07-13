import { describe, it, expect, afterEach } from 'vitest';
import { t, setLocale, getLocale, isLocale, locales, type TranslationKey } from '../index';

// t() reads module-level locale state; restore the default after each test so
// cases stay isolated regardless of execution order.
afterEach(() => {
  setLocale('en');
});

describe('t', () => {
  it('should return the raw translation when no params are given', () => {
    expect(t('posts')).toBe('Posts');
  });

  it('should substitute a string parameter', () => {
    expect(t('tagPageTitle', { tag: 'astro' })).toBe('Tag: astro');
  });

  it('should coerce a numeric parameter to a string', () => {
    expect(t('postsPageSubtitle', { count: 10 })).toBe('10 posts');
  });

  it('should leave the text untouched when a param placeholder is absent', () => {
    expect(t('posts', { unused: 'x' })).toBe('Posts');
  });

  it('should return the key itself when the key does not exist', () => {
    expect(t('missing-key' as TranslationKey)).toBe('missing-key');
  });

  it('should translate according to the active locale', () => {
    setLocale('ko');
    expect(t('posts')).toBe('포스트');
    expect(t('tagPostsCount', { count: 3 })).toBe('3개의 포스트');
  });

  it('should fall back to the key even under a non-default locale', () => {
    setLocale('ko');
    expect(t('missing-key' as TranslationKey)).toBe('missing-key');
  });
});

describe('setLocale / getLocale', () => {
  it('should default to en', () => {
    expect(getLocale()).toBe('en');
  });

  it('should switch the active locale', () => {
    setLocale('ko');
    expect(getLocale()).toBe('ko');
  });
});

describe('locales / isLocale', () => {
  it('should expose the supported locales', () => {
    expect(locales).toEqual(['en', 'ko']);
  });

  it('should accept supported locale codes', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('ko')).toBe(true);
  });

  it('should reject unsupported or empty values', () => {
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale('')).toBe(false);
  });
});
