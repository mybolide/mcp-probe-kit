/**
 * shadcn/ui registry 同步（blocks + components 索引）
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import type { SyncRuntimeOptions } from './ui-sync.js';
import type { UISourceMetadata } from './ui-metadata.js';

export const SHADCN_REGISTRY_URL =
  'https://ui.shadcn.com/r/styles/new-york/registry.json';
export const SHADCN_STYLE = 'new-york';

export interface ShadcnRegistryItem {
  name: string;
  type?: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files?: Array<{ path?: string; target?: string; type?: string }>;
}

export interface ShadcnRegistry {
  name?: string;
  homepage?: string;
  items: ShadcnRegistryItem[];
}

export interface ShadcnSearchRecord {
  name: string;
  title: string;
  description: string;
  type: 'block' | 'component' | 'other';
  stack: string;
  style: string;
  dependencies: string[];
  registryDependencies: string[];
  fileCount: number;
  files: string[];
  installCommand: string;
  category: string;
}

export interface ShadcnSyncResult {
  metadata: UISourceMetadata;
  blocks: number;
  components: number;
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (!signal?.aborted) return;
  const err = new Error(message);
  err.name = 'AbortError';
  throw err;
}

export function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal, 'Sync cancelled before fetch');

  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (location) {
          fetchText(location, signal).then(resolve).catch(reject);
          return;
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${url}: HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        if (signal?.aborted) {
          req.destroy(new Error('Sync cancelled while reading response'));
          return;
        }
        data += chunk;
      });

      res.on('end', () => {
        throwIfAborted(signal, 'Sync cancelled after fetch');
        resolve(data);
      });
    });

    const onAbort = () => req.destroy(new Error('Sync cancelled'));
    signal?.addEventListener('abort', onAbort, { once: true });

    req.on('error', (error) => {
      signal?.removeEventListener('abort', onAbort);
      reject(error);
    });

    req.on('close', () => {
      signal?.removeEventListener('abort', onAbort);
    });
  });
}

export function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return fetchText(url, signal).then((data) => {
    try {
      return JSON.parse(data) as T;
    } catch (error) {
      throw new Error(`Failed to parse JSON from ${url}: ${error}`);
    }
  });
}

export function computeRegistryChecksum(registry: ShadcnRegistry): string {
  const signature = (registry.items || [])
    .map((item) => `${item.name}:${item.type || ''}:${item.description || ''}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(signature).digest('hex').slice(0, 16);
}

function normalizeType(raw?: string): ShadcnSearchRecord['type'] {
  if (raw === 'registry:block') return 'block';
  if (raw === 'registry:ui') return 'component';
  return 'other';
}

function buildInstallCommand(name: string, type: ShadcnSearchRecord['type']): string {
  if (type === 'block' || type === 'component') {
    return `npx shadcn@latest add ${name}`;
  }
  return '';
}

export function transformRegistryItems(registry: ShadcnRegistry): {
  blocks: ShadcnSearchRecord[];
  components: ShadcnSearchRecord[];
} {
  const blocks: ShadcnSearchRecord[] = [];
  const components: ShadcnSearchRecord[] = [];

  for (const item of registry.items || []) {
    const type = normalizeType(item.type);
    if (type === 'other') continue;

    const files = (item.files || [])
      .map((file) => file.target || file.path || '')
      .filter(Boolean);

    const record: ShadcnSearchRecord = {
      name: item.name,
      title: item.name,
      description: item.description || `${type} from shadcn/ui (${SHADCN_STYLE})`,
      type,
      stack: 'react',
      style: SHADCN_STYLE,
      dependencies: item.dependencies || [],
      registryDependencies: item.registryDependencies || [],
      fileCount: files.length,
      files,
      installCommand: buildInstallCommand(item.name, type),
      category: type === 'block' ? 'shadcn-blocks' : 'shadcn-components',
    };

    if (type === 'block') {
      blocks.push(record);
    } else {
      components.push(record);
    }
  }

  return { blocks, components };
}

export async function fetchShadcnRegistry(signal?: AbortSignal): Promise<ShadcnRegistry> {
  return fetchJson<ShadcnRegistry>(SHADCN_REGISTRY_URL, signal);
}

export async function syncShadcnTo(
  outputDir: string,
  options?: SyncRuntimeOptions & { force?: boolean; existingChecksum?: string }
): Promise<ShadcnSyncResult | null> {
  throwIfAborted(options?.signal, 'shadcn sync cancelled');

  const registry = await fetchShadcnRegistry(options?.signal);
  const checksum = computeRegistryChecksum(registry);

  if (!options?.force && options?.existingChecksum === checksum) {
    return null;
  }

  const { blocks, components } = transformRegistryItems(registry);
  const shadcnDir = path.join(outputDir, 'shadcn');
  if (!fs.existsSync(shadcnDir)) {
    fs.mkdirSync(shadcnDir, { recursive: true });
  }

  fs.writeFileSync(path.join(shadcnDir, 'blocks.json'), `${JSON.stringify(blocks, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(path.join(shadcnDir, 'components.json'), `${JSON.stringify(components, null, 2)}\n`, 'utf-8');

  const syncedAt = new Date().toISOString();
  const metadata: UISourceMetadata = {
    version: checksum,
    syncedAt,
    checksum,
    style: SHADCN_STYLE,
    blocks: blocks.length,
    components: components.length,
  };

  return { metadata, blocks: blocks.length, components: components.length };
}
