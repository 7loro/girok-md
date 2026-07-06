import { readFileSync, writeFileSync } from 'fs';
import matter from 'gray-matter';

// Conservative single-line edit: gray-matter round-trips can destroy comments,
// key order, and quoting, so only the `publish:` line is ever touched.
export function setPublishInContent(raw: string, publish: boolean): string {
  const value = publish ? 'true' : 'false';
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      const fmBlock = raw.slice(0, end);
      const publishLine = /^publish\s*:.*$/m;
      if (publishLine.test(fmBlock)) {
        return fmBlock.replace(publishLine, `publish: ${value}`) + raw.slice(end);
      }
      return `${fmBlock}\npublish: ${value}${raw.slice(end)}`;
    }
  }
  return `---\npublish: ${value}\n---\n\n${raw}`;
}

export function setPublishFlag(filePath: string, publish: boolean): void {
  const raw = readFileSync(filePath, 'utf-8');
  const updated = setPublishInContent(raw, publish);
  // Verify before writing: the file on disk is only replaced by a version
  // that parses back to exactly the requested flag.
  const { data } = matter(updated);
  const applied = data.publish === true || data.publish === 'true';
  if (applied !== publish) {
    throw new Error(`Publish flag verification failed for ${filePath}`);
  }
  writeFileSync(filePath, updated, 'utf-8');
}
