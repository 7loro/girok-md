import { describe, it, expect } from 'vitest';
import { calculateReadingTime } from '../readingTime';

describe('calculateReadingTime', () => {
  it('should return minimum 1 minute for empty content', () => {
    expect(calculateReadingTime('')).toBe(1);
  });

  it('should return minimum 1 minute for very short content', () => {
    expect(calculateReadingTime('Hello world')).toBe(1);
  });

  it('should calculate 2 min for 400 english words (200 WPM)', () => {
    const words = Array(400).fill('word').join(' ');
    expect(calculateReadingTime(words)).toBe(2);
  });

  it('should round up partial minutes (250 words = 1.25 min → 2)', () => {
    const words = Array(250).fill('word').join(' ');
    expect(calculateReadingTime(words)).toBe(2);
  });

  it('should calculate 1 min for 500 korean chars (500 chars/min)', () => {
    const korean = '가'.repeat(500);
    expect(calculateReadingTime(korean)).toBe(1);
  });

  it('should calculate 2 min for 1000 korean chars', () => {
    const korean = '가'.repeat(1000);
    expect(calculateReadingTime(korean)).toBe(2);
  });

  it('should combine korean and english reading times', () => {
    // 250 한글(0.5분) + 100 영단어(0.5분) = 1분
    const korean = '가'.repeat(250);
    const english = Array(100).fill('word').join(' ');
    expect(calculateReadingTime(`${korean} ${english}`)).toBe(1);
  });

  it('should strip code blocks from calculation', () => {
    const content = `Some text
\`\`\`javascript
const x = 1;
const y = 2;
\`\`\`
End`;
    expect(calculateReadingTime(content)).toBe(1);
  });

  it('should strip inline code from calculation', () => {
    expect(calculateReadingTime('Use `npm install` to install')).toBe(1);
  });

  it('should strip image references from calculation', () => {
    expect(calculateReadingTime('Text ![alt](image.png) inside')).toBe(1);
  });

  it('should strip markdown links from calculation', () => {
    expect(calculateReadingTime('Click [here](https://example.com) for more')).toBe(1);
  });

  it('should strip heading markers from calculation', () => {
    expect(calculateReadingTime('## Hello World\n### Subtitle')).toBe(1);
  });

  it('should strip markdown formatting characters', () => {
    expect(calculateReadingTime('**bold** and *italic* and ~~strikethrough~~')).toBe(1);
  });

  it('should handle realistic markdown document', () => {
    const content = `# My Blog Post

This is a blog post about programming.

\`\`\`typescript
function hello() {
  console.log('world');
}
\`\`\`

Use \`hello()\` to greet.

![screenshot](image.png)

Read [more](https://example.com).

${Array(200).fill('word').join(' ')}`;

    expect(calculateReadingTime(content)).toBeGreaterThanOrEqual(1);
  });

  it('should correctly count mixed hangul jamo and syllables', () => {
    expect(calculateReadingTime('안녕하세요 반갑습니다 테스트입니다')).toBe(1);
  });

  it('should count the last hangul syllable 힣 (U+D7A3) as korean text', () => {
    // 250 space-separated 힣 land on the korean path: 250 / 500 = 0.5 min → 1.
    // If 힣 were excluded from the korean range, they would be counted as
    // 250 english words (250 / 200 = 1.25 min → 2), so this pins the upper bound.
    const content = Array(250).fill('힣').join(' ');
    expect(calculateReadingTime(content)).toBe(1);
  });
});
