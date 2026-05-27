/**
 * shadcn/ui 兼容主题预设（CSS variables，非 tweakcn 全量 fork）
 * 灵感来源：shadcn themes + tweakcn 风格的现代变量结构
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { UISourceMetadata } from './ui-metadata.js';

export const UI_THEMES_VERSION = '1.0.0';

export type ThemeCssVars = Record<string, string>;

export interface UIThemeRecord {
  name: string;
  title: string;
  description: string;
  style: 'new-york';
  stack: string;
  baseColor: string;
  mood: string;
  bestFor: string[];
  cssVarsLight: ThemeCssVars;
  cssVarsDark: ThemeCssVars;
  globalsCssSnippet: string;
  category: string;
  source: string;
}

export interface ThemesSyncResult {
  metadata: UISourceMetadata;
  count: number;
}

const BASE_LIGHT: ThemeCssVars = {
  background: '0 0% 100%',
  foreground: '240 10% 3.9%',
  card: '0 0% 100%',
  'card-foreground': '240 10% 3.9%',
  popover: '0 0% 100%',
  'popover-foreground': '240 10% 3.9%',
  secondary: '240 4.8% 95.9%',
  'secondary-foreground': '240 5.9% 10%',
  muted: '240 4.8% 95.9%',
  'muted-foreground': '240 3.8% 46.1%',
  accent: '240 4.8% 95.9%',
  'accent-foreground': '240 5.9% 10%',
  destructive: '0 84.2% 60.2%',
  'destructive-foreground': '0 0% 98%',
  border: '240 5.9% 90%',
  input: '240 5.9% 90%',
  ring: '240 5.9% 10%',
  radius: '0.5rem',
};

const BASE_DARK: ThemeCssVars = {
  background: '240 10% 3.9%',
  foreground: '0 0% 98%',
  card: '240 10% 3.9%',
  'card-foreground': '0 0% 98%',
  popover: '240 10% 3.9%',
  'popover-foreground': '0 0% 98%',
  secondary: '240 3.7% 15.9%',
  'secondary-foreground': '0 0% 98%',
  muted: '240 3.7% 15.9%',
  'muted-foreground': '240 5% 64.9%',
  accent: '240 3.7% 15.9%',
  'accent-foreground': '0 0% 98%',
  destructive: '0 62.8% 30.6%',
  'destructive-foreground': '0 0% 98%',
  border: '240 3.7% 15.9%',
  input: '240 3.7% 15.9%',
  ring: '240 4.9% 83.9%',
  radius: '0.5rem',
};

function withPrimary(
  light: ThemeCssVars,
  dark: ThemeCssVars,
  primaryLight: string,
  primaryDark: string
): { light: ThemeCssVars; dark: ThemeCssVars } {
  return {
    light: {
      ...light,
      primary: primaryLight,
      'primary-foreground': '0 0% 98%',
      ring: primaryLight,
    },
    dark: {
      ...dark,
      primary: primaryDark,
      'primary-foreground': '240 5.9% 10%',
      ring: primaryDark,
    },
  };
}

function renderGlobalsCss(name: string, light: ThemeCssVars, dark: ThemeCssVars): string {
  const toBlock = (vars: ThemeCssVars) =>
    Object.entries(vars)
      .map(([key, value]) => `    --${key}: ${value};`)
      .join('\n');

  return `@layer base {
  /* Theme: ${name} — paste into globals.css */
  :root {
${toBlock(light)}
  }
  .dark {
${toBlock(dark)}
  }
}`;
}

function buildTheme(input: {
  name: string;
  title: string;
  description: string;
  baseColor: string;
  mood: string;
  bestFor: string[];
  primaryLight: string;
  primaryDark: string;
}): UIThemeRecord {
  const { light, dark } = withPrimary(BASE_LIGHT, BASE_DARK, input.primaryLight, input.primaryDark);
  return {
    name: input.name,
    title: input.title,
    description: input.description,
    style: 'new-york',
    stack: 'react',
    baseColor: input.baseColor,
    mood: input.mood,
    bestFor: input.bestFor,
    cssVarsLight: light,
    cssVarsDark: dark,
    globalsCssSnippet: renderGlobalsCss(input.name, light, dark),
    category: 'ui-themes',
    source: 'mcp-probe-kit-curated-shadcn',
  };
}

export const CURATED_UI_THEMES: UIThemeRecord[] = [
  buildTheme({
    name: 'zinc-neutral',
    title: 'Zinc Neutral',
    description: '默认中性 SaaS 风格，低饱和、专业克制',
    baseColor: 'zinc',
    mood: 'neutral professional',
    bestFor: ['SaaS', 'B2B', 'Admin'],
    primaryLight: '240 5.9% 10%',
    primaryDark: '0 0% 98%',
  }),
  buildTheme({
    name: 'slate-dashboard',
    title: 'Slate Dashboard',
    description: '偏冷灰的数据看板与分析产品',
    baseColor: 'slate',
    mood: 'cool analytical',
    bestFor: ['Analytics Dashboard', 'Fintech'],
    primaryLight: '215.4 16.3% 36.9%',
    primaryDark: '210 40% 98%',
  }),
  buildTheme({
    name: 'blue-saas',
    title: 'Blue SaaS',
    description: '常见 B2B 蓝色主色，清晰可信',
    baseColor: 'blue',
    mood: 'trustworthy modern',
    bestFor: ['SaaS', 'B2B Service'],
    primaryLight: '221.2 83.2% 53.3%',
    primaryDark: '217.2 91.2% 59.8%',
  }),
  buildTheme({
    name: 'violet-creative',
    title: 'Violet Creative',
    description: '偏创意工具/设计产品的紫色主色',
    baseColor: 'violet',
    mood: 'creative premium',
    bestFor: ['Creative Agency', 'Portfolio'],
    primaryLight: '262.1 83.3% 57.8%',
    primaryDark: '263.4 70% 50.4%',
  }),
  buildTheme({
    name: 'rose-beauty',
    title: 'Rose Beauty',
    description: '美妆/生活方式产品的柔和玫瑰色',
    baseColor: 'rose',
    mood: 'soft elegant',
    bestFor: ['Beauty', 'E-commerce'],
    primaryLight: '346.8 77.2% 49.8%',
    primaryDark: '346.8 77.2% 49.8%',
  }),
  buildTheme({
    name: 'green-health',
    title: 'Green Health',
    description: '医疗/健康类产品的绿色主色',
    baseColor: 'green',
    mood: 'calm trustworthy',
    bestFor: ['Healthcare App', 'Educational App'],
    primaryLight: '142.1 76.2% 36.3%',
    primaryDark: '142.1 70.6% 45.3%',
  }),
  buildTheme({
    name: 'orange-energy',
    title: 'Orange Energy',
    description: '活动/增长类产品的橙色主色',
    baseColor: 'orange',
    mood: 'energetic friendly',
    bestFor: ['Social Media App', 'Government/Public Service'],
    primaryLight: '24.6 95% 53.1%',
    primaryDark: '20.5 90.2% 48.2%',
  }),
  buildTheme({
    name: 'stone-editorial',
    title: 'Stone Editorial',
    description: '内容/媒体站点常用的暖灰 editorial 感',
    baseColor: 'stone',
    mood: 'editorial warm',
    bestFor: ['Portfolio/Personal', 'Educational App'],
    primaryLight: '25 5.3% 24.7%',
    primaryDark: '60 9.1% 97.8%',
  }),
];

export function computeThemesChecksum(themes: UIThemeRecord[] = CURATED_UI_THEMES): string {
  const signature = themes.map((theme) => `${theme.name}:${UI_THEMES_VERSION}`).join('|');
  return crypto.createHash('sha256').update(signature).digest('hex').slice(0, 16);
}

export function syncThemesTo(
  outputDir: string,
  options?: { force?: boolean; existingChecksum?: string }
): ThemesSyncResult | null {
  const checksum = computeThemesChecksum();

  if (!options?.force && options?.existingChecksum === checksum) {
    return null;
  }

  const themesDir = path.join(outputDir, 'themes');
  if (!fs.existsSync(themesDir)) {
    fs.mkdirSync(themesDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(themesDir, 'presets.json'),
    `${JSON.stringify(CURATED_UI_THEMES, null, 2)}\n`,
    'utf-8'
  );

  return {
    metadata: {
      version: UI_THEMES_VERSION,
      syncedAt: new Date().toISOString(),
      checksum,
    },
    count: CURATED_UI_THEMES.length,
  };
}
