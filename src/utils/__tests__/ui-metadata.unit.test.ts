import { describe, expect, it } from 'vitest';
import { readUISyncMetadata, writeUISyncMetadata } from '../ui-metadata.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('ui-metadata', () => {
  it('migrates legacy metadata into sources map', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-meta-'));
    fs.writeFileSync(
      path.join(dir, 'metadata.json'),
      JSON.stringify({
        version: '2.2.3',
        syncedAt: '2026-01-01T00:00:00.000Z',
        source: 'uipro-cli',
        format: 'json',
      })
    );

    const metadata = readUISyncMetadata(dir);
    expect(metadata?.sources['uipro-cli']?.version).toBe('2.2.3');
    expect(metadata?.version).toBe('2.2.3');
  });

  it('writes metadata with trailing newline', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-meta-'));
    writeUISyncMetadata(dir, {
      version: '2.2.3',
      syncedAt: '2026-01-01T00:00:00.000Z',
      source: 'uipro-cli',
      format: 'json',
      sources: {
        'uipro-cli': { version: '2.2.3', syncedAt: '2026-01-01T00:00:00.000Z' },
        shadcn: { version: 'abc123', syncedAt: '2026-01-01T00:00:00.000Z', blocks: 10, components: 20 },
      },
    });

    const raw = fs.readFileSync(path.join(dir, 'metadata.json'), 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(JSON.parse(raw).sources.shadcn.blocks).toBe(10);
  });
});
