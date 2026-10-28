import { describe, expect, test } from 'vitest';
import {
  MCP_APPS_EXTENSION_ID, MCP_APP_MIME_TYPE, MCP_APP_RESOURCES,
  buildMcpAppHtml, buildMcpAppToolMeta, getMcpAppResource,
  getMcpAppResourceUri, supportsMcpApps,
} from '../mcp-apps.js';

const capability = { extensions: { [MCP_APPS_EXTENSION_ID]: { mimeTypes: [MCP_APP_MIME_TYPE] } } };

describe('v5 SQLite-only MCP Apps', () => {
  test('exports exactly the SQLite DevControl view and independent Memory Center', () => {
    expect(MCP_APP_RESOURCES.map(({ uri }) => uri)).toEqual([
      'ui://mcp-probe-kit/memory-center',
      'ui://mcp-probe-kit/devcontrol-workbench',
    ]);
    for (const obsolete of ['feature-workbench', 'bug-workbench', 'plan-workbench',
      'product-workbench', 'convergence']) {
      expect(getMcpAppResource('ui://mcp-probe-kit/' + obsolete)).toBeUndefined();
    }
    for (const obsolete of ['start_feature', 'start_bugfix', 'resume_plan', 'converge']) {
      expect(getMcpAppResourceUri(obsolete)).toBeUndefined();
      expect(buildMcpAppToolMeta(obsolete, capability, true)).toBeUndefined();
    }
  });

  test('negotiates correct app metadata without leaking app-only Memory operations', () => {
    expect(supportsMcpApps(capability)).toBe(true);
    expect(supportsMcpApps({ extensions: {} })).toBe(false);
    expect(buildMcpAppToolMeta('devcontrol', {}, true)).toBeUndefined();
    expect(buildMcpAppToolMeta('devcontrol', capability, false)).toBeUndefined();
    expect(buildMcpAppToolMeta('devcontrol', capability, true)).toMatchObject({
      ui: { resourceUri: 'ui://mcp-probe-kit/devcontrol-workbench', visibility: ['model', 'app'] },
    });
    expect(buildMcpAppToolMeta('search_memory', capability, true)).toMatchObject({
      ui: { resourceUri: 'ui://mcp-probe-kit/memory-center' },
    });
    expect(buildMcpAppToolMeta('list_memory_assets', capability, true, ['app'])).toMatchObject({
      ui: { visibility: ['app'] },
    });
  });

  test('new workbench only queries the real devcontrol tool and does not ship v4 runtime logic', () => {
    const html = buildMcpAppHtml(MCP_APP_RESOURCES[1]);
    expect(html).toContain('data-app-kind="devcontrol-workbench"');
    expect(html).toContain('name:"devcontrol"');
    expect(html).toContain('SQLite');
    expect(html).not.toContain('resume_plan');
    expect(html).not.toContain('plan_heartbeat');
    expect(html).not.toContain('start_feature');
    expect(html).not.toContain('rerun-converge');
    expect(html).toContain('aria-label=');
    expect(html).toContain('@container');
  });

  test('Memory center remains separate and v5 demos escape malicious embedded JSON', () => {
    const memory = buildMcpAppHtml(MCP_APP_RESOURCES[0]);
    expect(memory).toContain('data-app-kind="memory-center"');
    expect(memory).toContain('search_memory');
    expect(memory).not.toContain('plan_heartbeat');
    const payload = { enabled: true, projectRoot: '</script><script>alert(1)</script>' };
    const html = buildMcpAppHtml(MCP_APP_RESOURCES[1], { demo: payload });
    expect(html).toContain('window.__MCP_PROBE_DEMO__=');
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('\\u003c');
  });
});
