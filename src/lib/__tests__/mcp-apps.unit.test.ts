import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  MCP_APPS_EXTENSION_ID,
  MCP_APP_MIME_TYPE,
  MCP_APP_RESOURCES,
  buildMcpAppHtml,
  buildMcpAppToolMeta,
  getMcpAppResourceUri,
  supportsMcpApps,
} from '../mcp-apps.js';

const supportedCapabilities = {
  extensions: {
    [MCP_APPS_EXTENSION_ID]: {
      mimeTypes: [MCP_APP_MIME_TYPE],
    },
  },
};

describe('mcp-apps', () => {
  test('declares six stable MCP App resources', () => {
    expect(MCP_APP_RESOURCES).toHaveLength(6);
    expect(MCP_APP_RESOURCES.map((resource) => resource.uri)).toEqual(
      expect.arrayContaining([
        'ui://mcp-probe-kit/memory-center',
        'ui://mcp-probe-kit/feature-workbench',
        'ui://mcp-probe-kit/bug-workbench',
        'ui://mcp-probe-kit/plan-workbench',
        'ui://mcp-probe-kit/product-workbench',
        'ui://mcp-probe-kit/convergence',
      ]),
    );
  });

  test('detects negotiated official MCP Apps support', () => {
    expect(supportsMcpApps(supportedCapabilities)).toBe(true);
    expect(supportsMcpApps({ extensions: {} })).toBe(false);
    expect(supportsMcpApps(undefined)).toBe(false);
  });

  test('adds UI metadata only after capability negotiation', () => {
    expect(
      buildMcpAppToolMeta('start_feature', supportedCapabilities, true),
    ).toEqual({
      ui: {
        resourceUri: 'ui://mcp-probe-kit/feature-workbench',
        visibility: ['model', 'app'],
      },
      'ui/resourceUri': 'ui://mcp-probe-kit/feature-workbench',
    });
    expect(buildMcpAppToolMeta('start_feature', {}, true)).toBeUndefined();
    expect(buildMcpAppToolMeta('start_feature', supportedCapabilities, false)).toBeUndefined();
    expect(buildMcpAppToolMeta('gencommit', supportedCapabilities, true)).toBeUndefined();
    expect(
      buildMcpAppToolMeta(
        'list_memory_assets',
        supportedCapabilities,
        true,
        ['app'],
      ),
    ).toMatchObject({
      ui: {
        resourceUri: 'ui://mcp-probe-kit/memory-center',
        visibility: ['app'],
      },
    });
  });

  test('builds a self-contained Memory Center app document', () => {
    const resource = MCP_APP_RESOURCES.find(
      (item) => item.uri === 'ui://mcp-probe-kit/memory-center',
    );
    expect(resource).toBeDefined();
    const html = buildMcpAppHtml(resource!);
    expect(html).toContain('data-app-kind="memory-center"');
    expect(html).toContain('MCP Probe Kit Memory Center');
    expect(html).not.toContain('callTool("list_memory_assets"');
    expect(html).toContain('mode:"browse"');
    expect(html).toContain('ui/initialize');
    expect(html).toContain('minimal-header');
    expect(html).toContain('task-actions-end');
    expect(html).toContain('resume_plan');
    expect(html).toContain('plan_heartbeat');
    expect(html).toContain('Plan \\u68C0\\u67E5\\u70B9\\u6CA1\\u6709\\u771F\\u5B9E\\u6B65\\u9AA4\\u56DE\\u5199');
    expect(html).not.toContain('\\u540C\\u6B65\\u72B6\\u6001');
    expect(html).toContain('\\u4E0D\\u5F97\\u53EA\\u5B8C\\u6210\\u4EE3\\u7801\\u800C\\u4E0D\\u56DE\\u5199\\u72B6\\u6001');
    expect(html).not.toContain('max-height: 690px');
    expect(html).toContain('container-type: inline-size');
    expect(html).toContain('@media (max-width: 660px)');
    expect(html).toContain('@container mcp-app (max-width: 660px)');
    expect(html).toContain('grid-template-columns: 28px minmax(0, 1fr)');
    expect(html).toContain('@media (max-width: 460px)');
    expect(html).toContain('lifecycle-status');
    expect(html).toContain('gate-footer');
    expect(html).toContain('.productBrief');
    expect(html).toContain('.targetUsers');
    expect(html).toContain('.constraints');
    expect(html).toContain('max-width: 1080px');
    expect(html).toContain('min-height: 26px');
    expect(html).toContain('ui-sans-serif, system-ui');
    expect(html).toContain('font-size: 14px');
    expect(html).toContain('wb-empty-plan');
    expect(html).toContain('wb-empty-hint');
    expect(html).not.toContain('Development Workbench');
    expect(html).not.toContain('Product Workbench');
    expect(html).not.toContain('Quality Gate');
  });

  test('builds a self-contained read-only demo document', () => {
    const resource = MCP_APP_RESOURCES.find(
      (item) => item.uri === 'ui://mcp-probe-kit/feature-workbench',
    );
    expect(resource).toBeDefined();
    const html = buildMcpAppHtml(resource!, {
      demo: {
        enabled: true,
        frames: [{ input: { description: '</script><script>alert(1)</script>' } }],
      },
    });
    expect(html).toContain('window.__MCP_PROBE_DEMO__=');
    expect(html).toContain('\u003c/script\u003e');
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('data-app-kind="feature-workbench"');
  });

  test('Plan Workbench render path is strictly read-only with no native or custom controls', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'apps/mcp-probe-app.ts'),
      'utf8',
    );
    const start = source.indexOf('function renderTaskWorkbench()');
    const end = source.indexOf('function renderProductWorkbench()');
    const workbench = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(workbench).toContain('wb-readonly-footer');
    expect(workbench).toContain('wb-plan-mobile');
    expect(workbench).not.toContain('<button');
    expect(workbench).not.toContain('<details');
    expect(workbench).not.toContain('<summary');
    expect(workbench).not.toContain('data-action=');
  });

  test('maps model tools to stable app resources', () => {
    expect(getMcpAppResourceUri('search_memory')).toBe(
      'ui://mcp-probe-kit/memory-center',
    );
    expect(getMcpAppResourceUri('converge')).toBe(
      'ui://mcp-probe-kit/convergence',
    );
    expect(getMcpAppResourceUri('resume_plan')).toBe(
      'ui://mcp-probe-kit/plan-workbench',
    );
  });
});
