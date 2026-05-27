import { describe, expect, it } from 'vitest';
import { pickThemeForProductType } from '../../lib/shadcn-ui.js';
import { CURATED_UI_THEMES } from '../themes-sync.js';

describe('pickThemeForProductType', () => {
  it('prefers themes whose bestFor matches product type', () => {
    const picked = pickThemeForProductType(CURATED_UI_THEMES as unknown as Record<string, any>[], 'Healthcare App');
    expect(picked?.name).toBe('green-health');
  });
});
