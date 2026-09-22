import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadPromaxColorCatalog,
  parsePromaxColorCsv,
  resolvePromaxPalette,
  type PromaxColorRow,
} from '../promax-palette.js';

const FIXTURE: PromaxColorRow[] = [
  {
    productType: 'Healthcare App',
    primary: '#0891B2',
    accent: '#059669',
    background: '#ECFEFF',
    foreground: '#164E63',
    card: '#FFFFFF',
    mutedForeground: '#64748B',
    border: '#A5F3FC',
    destructive: '#DC2626',
    notes: 'Calm cyan + health green',
  },
  {
    productType: 'Luxury/Premium Brand',
    primary: '#1C1917',
    accent: '#A16207',
    background: '#FAFAF9',
    foreground: '#0C0A09',
    card: '#FFFFFF',
    mutedForeground: '#64748B',
    border: '#D6D3D1',
    destructive: '#DC2626',
    notes: 'Premium black + gold accent',
  },
];

const PRESET = {
  canvas: 'oklch(0.99 0.003 95)',
  surface: 'oklch(1 0 0)',
  text: 'oklch(0.16 0.02 70)',
  mutedText: 'oklch(0.38 0.02 70)',
  line: 'oklch(0.86 0.01 80)',
  accent: 'oklch(0.22 0.03 70)',
  accentStrong: 'oklch(0.12 0.02 70)',
  success: 'oklch(0.45 0.12 145)',
  warning: 'oklch(0.62 0.14 75)',
  danger: 'oklch(0.48 0.18 25)',
};

describe('promax-palette', () => {
  it('解析 skill CSV 列并匹配 Healthcare', () => {
    const rows = parsePromaxColorCsv(`No,Product Type,Primary,On Primary,Secondary,On Secondary,Accent,On Accent,Background,Foreground,Card,Card Foreground,Muted,Muted Foreground,Border,Destructive,On Destructive,Ring,Notes
8,Healthcare App,#0891B2,#FFFFFF,#22D3EE,#0F172A,#059669,#FFFFFF,#ECFEFF,#164E63,#FFFFFF,#164E63,#E8F1F6,#64748B,#A5F3FC,#DC2626,#FFFFFF,#0891B2,Calm cyan
`);
    expect(rows[0]?.accent).toBe('#059669');
    const resolved = resolvePromaxPalette({
      productType: 'Healthcare App',
      description: '患者查看检查结果',
      fallbackTokens: PRESET,
      paletteCatalog: rows,
    });
    expect(resolved.source).not.toBe('preset-fallback');
    expect(resolved.productType).toBe('Healthcare App');
    expect(resolved.tokens.accent).toBe('#059669');
    expect(resolved.tokens.canvas).toBe('#ECFEFF');
  });

  it('智能戒指官网匹配 Luxury 而不是空表兜底', () => {
    const resolved = resolvePromaxPalette({
      productType: 'wearable',
      description: '智能戒指品牌官网',
      screenType: 'marketing-page',
      fallbackTokens: PRESET,
      paletteCatalog: FIXTURE,
    });
    expect(resolved.productType).toBe('Luxury/Premium Brand');
    expect(resolved.tokens.accent).toBe('#A16207');
  });

  it('空目录走 preset 兜底', () => {
    const resolved = resolvePromaxPalette({
      productType: '未知产品',
      description: 'xyz',
      fallbackTokens: PRESET,
      paletteCatalog: [],
    });
    expect(resolved.source).toBe('preset-fallback');
    expect(resolved.tokens.accent).toBe(PRESET.accent);
  });

  it('本机 skill csv 优先于内置快照', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promax-skill-'));
    const dataDir = path.join(root, 'ui-ux-pro-max', 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, 'colors.csv'),
      `No,Product Type,Primary,Accent,Background,Foreground,Card,Muted Foreground,Border,Destructive,Notes
1,Healthcare App,#0891B2,#111111,#ECFEFF,#164E63,#FFFFFF,#64748B,#A5F3FC,#DC2626,from-skill
`,
    );
    const loaded = loadPromaxColorCatalog({ skillRoots: [root] });
    expect(loaded.source).toBe('skill-csv');
    expect(loaded.rows[0]?.accent).toBe('#111111');
  });
});
