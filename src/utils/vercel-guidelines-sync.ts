/**
 * Vercel Web Interface Guidelines → 可搜索 JSON
 * @see https://github.com/vercel-labs/web-interface-guidelines
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchText } from './shadcn-sync.js';
import type { UISourceMetadata } from './ui-metadata.js';

export const VERCEL_GUIDELINES_URL =
  'https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/AGENTS.md';
export const VERCEL_GUIDELINES_VERSION = '2026-04-06';

export interface VercelGuidelineRecord {
  id: string;
  title: string;
  section: string;
  subsection: string;
  level: 'MUST' | 'SHOULD' | 'NEVER' | 'INFO';
  rule: string;
  description: string;
  category: string;
  source: string;
  tags: string[];
}

export interface VercelGuidelinesSyncResult {
  metadata: UISourceMetadata;
  count: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FALLBACK_PATH = path.join(
  process.cwd(),
  'scripts',
  'data',
  'vercel-web-interface-guidelines.md'
);
const BUNDLED_FALLBACK_PATH = path.join(
  __dirname,
  '..',
  '..',
  'scripts',
  'data',
  'vercel-web-interface-guidelines.md'
);

function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function inferTags(rule: string, section: string): string[] {
  const text = `${section} ${rule}`.toLowerCase();
  const tags = new Set<string>(['vercel', 'web-interface']);
  const keywords = [
    'keyboard',
    'focus',
    'form',
    'animation',
    'accessibility',
    'a11y',
    'contrast',
    'dark',
    'performance',
    'touch',
    'navigation',
    'aria',
    'mobile',
    'layout',
    'hydration',
  ];
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      tags.add(keyword);
    }
  }
  return Array.from(tags);
}

export function parseVercelGuidelinesMarkdown(markdown: string): VercelGuidelineRecord[] {
  const lines = markdown.split(/\r?\n/);
  let section = 'General';
  let subsection = 'General';
  const records: VercelGuidelineRecord[] = [];
  let index = 0;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      subsection = section;
      continue;
    }
    if (line.startsWith('### ')) {
      subsection = line.slice(4).trim();
      continue;
    }

    const match = line.match(/^-\s+(MUST|SHOULD|NEVER):\s+(.+)$/);
    if (!match) {
      continue;
    }

    index += 1;
    const level = match[1] as VercelGuidelineRecord['level'];
    const rule = match[2].trim();
    const id = `vercel-${slugify(section)}-${slugify(subsection)}-${index}`;

    records.push({
      id,
      title: `${level}: ${rule.slice(0, 80)}${rule.length > 80 ? '…' : ''}`,
      section,
      subsection,
      level,
      rule,
      description: rule,
      category: 'ui-guidelines-vercel',
      source: 'vercel-labs/web-interface-guidelines',
      tags: inferTags(rule, section),
    });
  }

  return records;
}

async function loadGuidelinesMarkdown(signal?: AbortSignal): Promise<string> {
  try {
    const text = await fetchText(VERCEL_GUIDELINES_URL, signal);
    if (text.includes('MUST:')) {
      return text;
    }
  } catch {
    // fallback below
  }

  for (const candidate of [FALLBACK_PATH, BUNDLED_FALLBACK_PATH]) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8');
    }
  }

  throw new Error('Vercel Web Interface Guidelines fallback file not found');
}

export async function syncVercelGuidelinesTo(
  outputDir: string,
  options?: { signal?: AbortSignal; force?: boolean; existingChecksum?: string }
): Promise<VercelGuidelinesSyncResult | null> {
  const markdown = await loadGuidelinesMarkdown(options?.signal);
  const checksum = computeChecksum(markdown);

  if (!options?.force && options?.existingChecksum === checksum) {
    return null;
  }

  const records = parseVercelGuidelinesMarkdown(markdown);
  const guidelinesDir = path.join(outputDir, 'guidelines');
  if (!fs.existsSync(guidelinesDir)) {
    fs.mkdirSync(guidelinesDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(guidelinesDir, 'vercel-web-interface.json'),
    `${JSON.stringify(records, null, 2)}\n`,
    'utf-8'
  );

  return {
    metadata: {
      version: VERCEL_GUIDELINES_VERSION,
      syncedAt: new Date().toISOString(),
      checksum,
    },
    count: records.length,
  };
}

export async function getVercelGuidelinesChecksum(signal?: AbortSignal): Promise<string> {
  const markdown = await loadGuidelinesMarkdown(signal);
  return computeChecksum(markdown);
}
