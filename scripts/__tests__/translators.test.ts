import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTranslator } from '../translators/index.ts';
import { LLMTranslator } from '../translators/llm.ts';

describe('createTranslator', () => {
  afterEach(() => {
    delete process.env.GIROK_TEST_API_KEY;
    vi.restoreAllMocks();
  });

  it('should warn and fall back to Google Free when the env var is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const translator = createTranslator({
      enabled: true,
      target_langs: ['en'],
      provider: 'openai',
      api_key: '${GIROK_TEST_API_KEY}',
      model: 'gpt-4o-mini',
    });
    expect(translator.getName()).toContain('Google');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('GIROK_TEST_API_KEY'));
  });

  it('should create an LLM translator when the env var resolves', () => {
    process.env.GIROK_TEST_API_KEY = 'sk-test';
    const translator = createTranslator({
      enabled: true,
      target_langs: ['en'],
      provider: 'openai',
      api_key: '${GIROK_TEST_API_KEY}',
      model: 'gpt-4o-mini',
    });
    expect(translator.getName()).toContain('OpenAI');
  });

  it('should fall back silently when no LLM config is present at all', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const translator = createTranslator({ enabled: true, target_langs: ['en'] });
    expect(translator.getName()).toContain('Google');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('LLMTranslator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(response: Partial<Response> & { json?: () => Promise<unknown>; text?: () => Promise<string> }): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, ...response });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('should send the Google AI key in a header instead of the URL', async () => {
    const fetchMock = stubFetch({
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'translated' }] } }] }),
    });
    const t = new LLMTranslator('google', 'secret-key', 'gemini-pro');
    await t.translate('hello', 'en', 'ko');
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).not.toContain('secret-key');
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
  });

  it('should throw when the provider returns an empty translation', async () => {
    stubFetch({ json: () => Promise.resolve({ choices: [] }) });
    const t = new LLMTranslator('openai', 'k', 'gpt-4o-mini');
    await expect(t.translate('hello', 'en', 'ko')).rejects.toThrow(/empty/i);
  });

  it('should truncate long provider error bodies', async () => {
    stubFetch({ ok: false, status: 500, text: () => Promise.resolve('x'.repeat(1000)) });
    const t = new LLMTranslator('openai', 'k', 'gpt-4o-mini');
    await expect(t.translate('hello', 'en', 'ko')).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('x'.repeat(300)) }) as Error,
    );
  });
});
