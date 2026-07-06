export type TomlValue = string | boolean | number | string[];

export function serializeTomlValue(value: TomlValue): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
  return JSON.stringify(value);
}

// Line-based replacement so comments, ordering, and quoting stay intact.
// `updates` maps section name ('' for top level) → key → new value.
// Throws if any requested key is not present as an active line in the file.
export function updateTomlContent(
  raw: string,
  updates: Record<string, Record<string, TomlValue>>,
): string {
  const pending = new Map<string, Map<string, TomlValue>>();
  for (const [section, kv] of Object.entries(updates)) {
    pending.set(section, new Map(Object.entries(kv)));
  }

  const lines = raw.split('\n');
  let section = '';
  for (let i = 0; i < lines.length; i++) {
    const sectionMatch = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    const keyMatch = lines[i].match(/^(\s*)([A-Za-z0-9_-]+)\s*=/);
    if (!keyMatch) continue;
    const kv = pending.get(section);
    if (kv && kv.has(keyMatch[2])) {
      lines[i] = `${keyMatch[1]}${keyMatch[2]} = ${serializeTomlValue(kv.get(keyMatch[2])!)}`;
      kv.delete(keyMatch[2]);
    }
  }

  const leftovers: string[] = [];
  for (const [sec, kv] of pending) {
    for (const key of kv.keys()) {
      leftovers.push(sec ? `${sec}.${key}` : key);
    }
  }
  if (leftovers.length > 0) {
    throw new Error(`Keys not found in setting.toml: ${leftovers.join(', ')}`);
  }

  return lines.join('\n');
}
