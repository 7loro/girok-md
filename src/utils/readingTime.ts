const WORDS_PER_MINUTE = 200;
const KOREAN_CHARS_PER_MINUTE = 500;

export function calculateReadingTime(content: string): number {
  const text = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_~`]/g, '')
    .replace(/\n/g, ' ')
    .trim();

  const koreanChars = (text.match(/[\u3131-\uD7A3]/g) || []).length;
  const englishWords = text
    .replace(/[\u3131-\uD7A3]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0).length;

  const koreanMinutes = koreanChars / KOREAN_CHARS_PER_MINUTE;
  const englishMinutes = englishWords / WORDS_PER_MINUTE;

  return Math.max(1, Math.ceil(koreanMinutes + englishMinutes));
}
