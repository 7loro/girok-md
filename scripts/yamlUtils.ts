// Shared YAML scalar formatting for hand-built frontmatter (sync.ts / translate.ts).

// Quote a string when raw emission would change its meaning in YAML: structural
// characters, comment markers, leading/trailing whitespace, list-like prefixes,
// or scalar literals (booleans, null, numbers) that would lose their string type.
export function formatYamlString(value: string, options: { forceQuote?: boolean } = {}): string {
  const needsQuotes =
    options.forceQuote === true ||
    /[\n\r":#{}[\]&*!|>'%@`]/.test(value) ||
    /^[\s\-?,]/.test(value) ||
    /\s$/.test(value) ||
    /^(true|false|null|~|yes|no|on|off)$/i.test(value) ||
    /^[+-]?(\d[\d_]*\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value) ||
    value.length > 80;
  if (!needsQuotes) return value;
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}
