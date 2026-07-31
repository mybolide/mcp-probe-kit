import { createHash } from 'node:crypto';

export function normalizeContentForHash(content: string): string {
  return content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function buildMemoryContentHashes(content: string): {
  contentHash: string;
  normalizedContentHash: string;
} {
  return {
    contentHash: sha256Hex(content),
    normalizedContentHash: sha256Hex(normalizeContentForHash(content)),
  };
}
