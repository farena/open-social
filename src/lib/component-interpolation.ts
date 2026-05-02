const PARAM_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function interpolate(text: string, params: Record<string, string>): string {
  return text.replace(PARAM_REGEX, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match;
  });
}

export function extractParameterKeys(...sources: string[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const source of sources) {
    for (const match of source.matchAll(PARAM_REGEX)) {
      const key = match[1];
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}
