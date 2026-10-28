/** Stable IDs for requirements stored in SQLite. Never rewrite original prose. */
export function canonicalRequirementId(value: string): string {
  const match = /^(FR|NFR)-(\d+)$/i.exec(value.trim());
  if (!match) return value.trim();
  const digits = match[2].replace(/^0+(?=\d)/, '');
  return match[1].toUpperCase() + '-' + digits.padStart(3, '0');
}

export function extractRequirementRefs(source: string): Array<{ id: string; sourceIds: string[] }> {
  const found = new Map<string, Set<string>>();
  for (const match of source.matchAll(/\b(?:FR|NFR)-\d+\b/gi)) {
    const rawId = match[0];
    const id = canonicalRequirementId(rawId);
    if (!found.has(id)) found.set(id, new Set());
    found.get(id)!.add(rawId);
  }
  return [...found].map(([id, sourceIds]) => ({ id, sourceIds: [...sourceIds] }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
