import { describe, expect, it } from 'vitest';
import { CURATED_UI_THEMES, computeThemesChecksum, syncThemesTo } from '../themes-sync.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('themes-sync', () => {
  it('ships curated shadcn-compatible theme presets', () => {
    expect(CURATED_UI_THEMES.length).toBeGreaterThanOrEqual(8);
    const blue = CURATED_UI_THEMES.find((theme) => theme.name === 'blue-saas');
    expect(blue?.globalsCssSnippet).toContain('--primary:');
    expect(blue?.category).toBe('ui-themes');
  });

  it('writes presets.json when checksum changes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-themes-'));
    const result = syncThemesTo(dir, { force: true });
    expect(result?.count).toBe(CURATED_UI_THEMES.length);
    expect(fs.existsSync(path.join(dir, 'themes', 'presets.json'))).toBe(true);

    const again = syncThemesTo(dir, { existingChecksum: computeThemesChecksum() });
    expect(again).toBeNull();
  });
});
