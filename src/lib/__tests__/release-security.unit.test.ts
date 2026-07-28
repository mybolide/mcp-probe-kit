import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = process.cwd();

describe('发布安全闸门', () => {
  test.each([
    'scripts/mcp-handshake-smoke.mjs',
    'scripts/mcp-sdk-handshake.mjs',
  ])('%s 不包含硬编码的记忆库凭据', (relativePath) => {
    const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    expect(content).not.toMatch(/MEMORY_(?:QDRANT|EMBEDDING)_API_KEY\s*:\s*["'][^"']+["']/);
  });
});
