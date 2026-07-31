import { describe, expect, test } from 'vitest';
import { MCP_APP_MIME_TYPE } from '../../lib/mcp-apps.js';
import { UiAppResourceStore } from '../ui-app-resource-store.js';

describe('UiAppResourceStore', () => {
  test('disabled store exposes no app resources and does not alter results', () => {
    const store = new UiAppResourceStore(false);
    const result = { structuredContent: { ok: true } };
    expect(store.decorate('start_ui', {}, result)).toBe(result);
    expect(store.list()).toEqual([]);
    expect(store.read('ui://mcp-probe-kit/memory-center')).toBeNull();
  });

  test('enabled store exposes five stable standards-compliant resources', () => {
    const store = new UiAppResourceStore(true);
    const resources = store.list();
    expect(resources).toHaveLength(5);
    expect(resources.every((item) => item.mimeType === MCP_APP_MIME_TYPE)).toBe(true);

    const content = store.read('ui://mcp-probe-kit/memory-center');
    expect(content?.mimeType).toBe(MCP_APP_MIME_TYPE);
    expect(content?.text).toContain('data-app-kind="memory-center"');
    expect(content?.text).toContain('Memory Center');
    expect(content?._meta?.ui).toBeDefined();
  });
});
