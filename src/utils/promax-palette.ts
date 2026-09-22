import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseCSV } from 'csv-parse/sync';

export type PromaxPaletteSource = 'skill-csv' | 'embedded' | 'preset-fallback';

export interface PromaxColorRow {
  productType: string;
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  card: string;
  mutedForeground: string;
  border: string;
  destructive: string;
  notes: string;
}

export interface PaletteResolution {
  source: PromaxPaletteSource;
  productType?: string;
  notes?: string;
  tokens: Record<string, string>;
}

const MATCH_THRESHOLD = 14;

const ALIASES: Array<{ re: RegExp; targets: string[]; boost: number }> = [
  { re: /医疗|health|clinic|hospital|patient/i, targets: ['Healthcare App'], boost: 40 },
  { re: /政务|政府|public service|government/i, targets: ['Government/Public Service'], boost: 40 },
  { re: /电商|商城|e-commerce|ecommerce/i, targets: ['E-commerce', 'E-commerce Luxury'], boost: 30 },
  { re: /戒指|珠宝|wearable|luxury|premium|品牌官网/i, targets: ['Luxury/Premium Brand', 'E-commerce Luxury', 'Portfolio/Personal'], boost: 36 },
  { re: /交易|行情|fintech|金融/i, targets: ['Financial Dashboard', 'Fintech/Crypto'], boost: 28 },
  { re: /saas|后台|审批|工单|crm|erp/i, targets: ['SaaS (General)', 'B2B Service'], boost: 18 },
];

function skillRoots(extra?: string[]): string[] {
  const fromEnv = (process.env.MCP_SKILLS_ROOTS || '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  const home = os.homedir();
  return [...new Set([
    ...(extra || []),
    ...fromEnv,
    path.join(home, '.agents', 'skills'),
    path.join(home, '.codex', 'skills'),
    path.join(home, '.codex', 'skills', '.system'),
  ])];
}

function pick(record: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]?.trim();
    if (value) return value;
  }
  return '';
}

export function normalizePromaxRow(raw: Record<string, string>): PromaxColorRow | null {
  const productType = pick(raw, ['Product Type', 'productType', 'product_type']);
  if (!productType) return null;
  const primary = pick(raw, ['Primary', 'Primary (Hex)']);
  const accent = pick(raw, ['Accent', 'CTA (Hex)', 'CTA']) || primary;
  const background = pick(raw, ['Background', 'Background (Hex)']);
  const foreground = pick(raw, ['Foreground', 'Text', 'Text (Hex)']);
  if (!background || !foreground) return null;
  return {
    productType,
    primary: primary || accent,
    accent,
    background,
    foreground,
    card: pick(raw, ['Card']) || '#FFFFFF',
    mutedForeground: pick(raw, ['Muted Foreground']) || pick(raw, ['Secondary (Hex)']) || foreground,
    border: pick(raw, ['Border', 'Border (Hex)']) || '#E2E8F0',
    destructive: pick(raw, ['Destructive']) || '#DC2626',
    notes: pick(raw, ['Notes']),
  };
}

export function parsePromaxColorCsv(text: string): PromaxColorRow[] {
  const records = parseCSV(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
  return records.map(normalizePromaxRow).filter((row): row is PromaxColorRow => Boolean(row));
}

function parsePromaxColorJson(text: string): PromaxColorRow[] {
  const parsed = JSON.parse(text) as Record<string, string>[];
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizePromaxRow).filter((row): row is PromaxColorRow => Boolean(row));
}

function embeddedPaths(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.resolve(here, '../resources/ui-ux-data');
  return [
    path.join(dataDir, 'promax-colors.csv'),
    path.join(dataDir, 'colors.json'),
  ];
}

export function loadPromaxColorCatalog(options?: {
  skillRoots?: string[];
  disableSkill?: boolean;
}): { source: Exclude<PromaxPaletteSource, 'preset-fallback'>; rows: PromaxColorRow[] } {
  if (!options?.disableSkill) {
    for (const root of skillRoots(options?.skillRoots)) {
      const csvPath = path.join(root, 'ui-ux-pro-max', 'data', 'colors.csv');
      if (fs.existsSync(csvPath)) {
        const rows = parsePromaxColorCsv(fs.readFileSync(csvPath, 'utf8'));
        if (rows.length > 0) return { source: 'skill-csv', rows };
      }
    }
  }

  for (const filePath of embeddedPaths()) {
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    const rows = filePath.endsWith('.json') ? parsePromaxColorJson(text) : parsePromaxColorCsv(text);
    if (rows.length > 0) return { source: 'embedded', rows };
  }

  return { source: 'embedded', rows: [] };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function scoreRow(row: PromaxColorRow, query: string, screenType: string): number {
  const type = row.productType.toLowerCase();
  const q = query.toLowerCase();
  if (!q.trim()) return 0;
  if (q.includes(type) || type.includes(q.trim())) return 100;

  const typeTokens = tokenize(row.productType);
  const queryTokens = tokenize(query);
  let score = typeTokens.filter((token) => queryTokens.includes(token) || q.includes(token)).length * 10;

  for (const alias of ALIASES) {
    if (alias.re.test(query) && alias.targets.some((target) => type.includes(target.toLowerCase()))) {
      score += alias.boost;
    }
  }

  if (screenType === 'professional-dashboard' && /dashboard|analytics|financial/.test(type)) score += 16;
  if (screenType === 'workflow-console' && /saas|b2b|admin|service/.test(type)) score += 12;
  if (screenType.startsWith('commerce') && /e-commerce|commerce/.test(type)) score += 20;
  if (screenType === 'marketing-page' && /luxury|premium brand|portfolio/.test(type)) score += 14;
  if (screenType === 'marketing-page' && /agency/.test(type) && /戒指|wearable|官网|品牌/.test(query)) score -= 24;

  return score;
}

export function tokensFromPromaxRow(row: PromaxColorRow, fallback: Record<string, string>): Record<string, string> {
  return {
    ...fallback,
    canvas: row.background,
    surface: row.card,
    text: row.foreground,
    mutedText: row.mutedForeground,
    line: row.border,
    accent: row.accent,
    accentStrong: row.primary,
    danger: row.destructive || fallback.danger,
  };
}

export function resolvePromaxPalette(input: {
  productType: string;
  description?: string;
  screenType?: string;
  fallbackTokens: Record<string, string>;
  paletteCatalog?: PromaxColorRow[];
  skillRoots?: string[];
}): PaletteResolution {
  const loaded = input.paletteCatalog
    ? { source: 'embedded' as const, rows: input.paletteCatalog }
    : loadPromaxColorCatalog({ skillRoots: input.skillRoots });

  if (!loaded.rows.length) {
    return { source: 'preset-fallback', tokens: { ...input.fallbackTokens } };
  }

  const query = `${input.productType} ${input.description || ''} ${input.screenType || ''}`;
  let best: { row: PromaxColorRow; score: number } | undefined;
  for (const row of loaded.rows) {
    const score = scoreRow(row, query, input.screenType || '');
    if (!best || score > best.score) best = { row, score };
  }

  if (!best || best.score < MATCH_THRESHOLD) {
    return { source: 'preset-fallback', tokens: { ...input.fallbackTokens } };
  }

  return {
    source: loaded.source,
    productType: best.row.productType,
    notes: best.row.notes,
    tokens: tokensFromPromaxRow(best.row, input.fallbackTokens),
  };
}
