/**
 * UI/UX 多源同步元数据
 */

import * as fs from 'fs';
import * as path from 'path';

export interface UISourceMetadata {
  version: string;
  syncedAt: string;
  checksum?: string;
  style?: string;
  blocks?: number;
  components?: number;
}

export interface UISyncMetadata {
  /** @deprecated 兼容旧版：等同 uipro-cli version */
  version: string;
  syncedAt: string;
  /** @deprecated 兼容旧版 */
  source: string;
  format: 'json';
  sources: {
    'uipro-cli'?: UISourceMetadata;
    shadcn?: UISourceMetadata;
    themes?: UISourceMetadata;
    vercel?: UISourceMetadata;
  };
}

export function readUISyncMetadata(outputDir: string): UISyncMetadata | null {
  const metadataPath = path.join(outputDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as Partial<UISyncMetadata>;
    if (!raw.sources) {
      return {
        version: raw.version || 'unknown',
        syncedAt: raw.syncedAt || new Date(0).toISOString(),
        source: raw.source || 'uipro-cli',
        format: 'json',
        sources: {
          'uipro-cli': {
            version: raw.version || 'unknown',
            syncedAt: raw.syncedAt || new Date(0).toISOString(),
          },
        },
      };
    }
    return raw as UISyncMetadata;
  } catch {
    return null;
  }
}

export function writeUISyncMetadata(outputDir: string, metadata: UISyncMetadata): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const metadataPath = path.join(outputDir, 'metadata.json');
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
}
