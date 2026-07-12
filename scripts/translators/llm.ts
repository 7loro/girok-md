import type { Translator } from './index.ts';

type Provider = 'openai' | 'anthropic' | 'google';

interface LLMRequestConfig {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

const LANGUAGE_NAMES: Record<string, string> = {
  ko: 'Korean',
  en: 'English',
  ja: 'Japanese',
  zh: 'Chinese',
  'zh-cn': 'Simplified Chinese',
  'zh-tw': 'Traditional Chinese',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

export class LLMTranslator implements Translator {
  private provider: Provider;
  private apiKey: string;
  private model: string;

  constructor(provider: Provider, apiKey: string, model: string) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model;
  }

  getName(): string {
    const providerNames: Record<Provider, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google AI',
    };
    return `${providerNames[this.provider]} (${this.model})`;
  }

  async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
    const sourceLanguage = this.getLanguageName(sourceLang);
    const targetLanguage = this.getLanguageName(targetLang);

    const systemPrompt = `You are a professional translator. Translate the following markdown content from ${sourceLanguage} to ${targetLanguage}.

Rules:
1. Preserve all markdown syntax (headers, links, code blocks, etc.)
2. Preserve all frontmatter YAML as-is (do not translate)
3. Keep technical terms, code, URLs, and file paths unchanged
4. Maintain the same tone and style
5. Output ONLY the translated text, no explanations`;

    const config = this.buildRequestConfig(systemPrompt, text);
    const response = await fetch(config.url, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify(config.body),
    });

    if (!response.ok) {
      // Truncate: provider error bodies can be huge and may echo request details.
      const errorText = (await response.text()).slice(0, 200);
      throw new Error(`${this.provider} API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = this.extractContent(data);
    if (!content) {
      // An unexpected response shape must fail loudly instead of saving an empty translation.
      throw new Error(`${this.provider} API returned an empty translation (unexpected response shape)`);
    }
    return content;
  }

  private getLanguageName(code: string): string {
    return LANGUAGE_NAMES[code.toLowerCase()] || code;
  }

  private buildRequestConfig(systemPrompt: string, userContent: string): LLMRequestConfig {
    switch (this.provider) {
      case 'openai':
        return this.buildOpenAIConfig(systemPrompt, userContent);
      case 'anthropic':
        return this.buildAnthropicConfig(systemPrompt, userContent);
      case 'google':
        return this.buildGoogleAIConfig(systemPrompt, userContent);
      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }
  }

  private buildOpenAIConfig(systemPrompt: string, userContent: string): LLMRequestConfig {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: {
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
      },
    };
  }

  private buildAnthropicConfig(systemPrompt: string, userContent: string): LLMRequestConfig {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: this.model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userContent },
        ],
      },
    };
  }

  private buildGoogleAIConfig(systemPrompt: string, userContent: string): LLMRequestConfig {
    return {
      // The key goes in a header, not the URL, so it cannot leak via error messages or logs.
      url: `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: {
        contents: [
          {
            parts: [
              { text: `${systemPrompt}\n\n${userContent}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
        },
      },
    };
  }

  private extractContent(data: unknown): string {
    switch (this.provider) {
      case 'openai':
        return this.extractOpenAIContent(data);
      case 'anthropic':
        return this.extractAnthropicContent(data);
      case 'google':
        return this.extractGoogleAIContent(data);
      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }
  }

  private extractOpenAIContent(data: unknown): string {
    const response = data as { choices: Array<{ message: { content: string } }> };
    return response.choices[0]?.message?.content || '';
  }

  private extractAnthropicContent(data: unknown): string {
    const response = data as { content: Array<{ text: string }> };
    return response.content[0]?.text || '';
  }

  private extractGoogleAIContent(data: unknown): string {
    const response = data as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    return response.candidates[0]?.content?.parts[0]?.text || '';
  }
}
