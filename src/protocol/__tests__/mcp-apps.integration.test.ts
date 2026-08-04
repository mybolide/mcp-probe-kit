import { afterEach, describe, expect, test, vi } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createProbeServer } from '../../server/create-server.js';
import {
  MCP_APPS_EXTENSION_ID,
  MCP_APP_MIME_TYPE,
} from '../../lib/mcp-apps.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('official MCP Apps integration', () => {
  test('negotiates UI metadata, serves Memory Center, and keeps app-only actions out of tools/list', async () => {
    vi.stubEnv('MCP_TOOLSET', 'compact');
    vi.stubEnv('MCP_ENABLE_UI_APPS', 'true');
    vi.stubEnv('MEMORY_QDRANT_URL', '');
    vi.stubEnv('MEMORY_EMBEDDING_URL', '');

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const runtime = createProbeServer({ protocolMode: 'auto' });
    const client = new Client(
      { name: 'mcp-apps-test', version: '1.0.0' },
      {
        capabilities: {
          extensions: {
            [MCP_APPS_EXTENSION_ID]: {
              mimeTypes: [MCP_APP_MIME_TYPE],
            },
          },
        },
      },
    );

    await runtime.server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      expect(client.getServerCapabilities()).toMatchObject({
        extensions: {
          [MCP_APPS_EXTENSION_ID]: {
            mimeTypes: [MCP_APP_MIME_TYPE],
          },
        },
      });

      const status = await client.readResource({ uri: 'probe://status' });
      const statusContent = status.contents[0];
      expect(statusContent && 'text' in statusContent
        ? JSON.parse(statusContent.text).extensions.uiAppsNegotiated
        : false).toBe(true);

      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(24);
      expect(tools.tools.some((tool) => tool.name === 'list_memory_assets')).toBe(false);
      expect(tools.tools.some((tool) => tool.name === 'architecture')).toBe(true);
      const feature = tools.tools.find((tool) => tool.name === 'start_feature');
      expect(feature?._meta).toMatchObject({
        ui: {
          resourceUri: 'ui://mcp-probe-kit/feature-workbench',
          visibility: ['model', 'app'],
        },
      });
      expect(tools.tools.find((tool) => tool.name === 'gencommit')?._meta?.ui).toBeUndefined();

      const resources = await client.listResources();
      const memoryResource = resources.resources.find(
        (resource) => resource.uri === 'ui://mcp-probe-kit/memory-center',
      );
      expect(memoryResource?.mimeType).toBe(MCP_APP_MIME_TYPE);

      const document = await client.readResource({
        uri: 'ui://mcp-probe-kit/memory-center',
      });
      const content = document.contents[0];
      expect(content && 'text' in content ? content.text : '').toContain(
        'data-app-kind="memory-center"',
      );

      const appOnlyResult = await client.callTool({
        name: 'list_memory_assets',
        arguments: { limit: 10 },
      });
      expect(appOnlyResult.isError ?? false).toBe(false);
      expect(appOnlyResult.structuredContent).toMatchObject({
        enabled: false,
        items: [],
        total: 0,
      });
    } finally {
      await client.close().catch(() => undefined);
      await runtime.server.close().catch(() => undefined);
    }
  });

  test('keeps the Memory-enabled compact surface at 30 tools for MCP Apps clients', async () => {
    vi.stubEnv('MCP_TOOLSET', 'compact');
    vi.stubEnv('MCP_ENABLE_UI_APPS', 'true');
    vi.stubEnv('MEMORY_QDRANT_URL', 'http://127.0.0.1:6333');
    vi.stubEnv('MEMORY_EMBEDDING_URL', 'http://127.0.0.1:11434');
    vi.stubEnv('MEMORY_EMBEDDING_MODEL', 'nomic-embed-text');

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const runtime = createProbeServer({ protocolMode: 'auto' });
    const client = new Client(
      { name: 'cursor-like-mcp-apps-client', version: '1.0.0' },
      {
        capabilities: {
          extensions: {
            [MCP_APPS_EXTENSION_ID]: {
              mimeTypes: [MCP_APP_MIME_TYPE],
            },
          },
        },
      },
    );

    await runtime.server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(30);
      expect(tools.tools.some((tool) => tool.name === 'list_memory_assets')).toBe(false);
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          'search_memory',
          'read_memory_asset',
          'memorize_asset',
          'update_memory_asset',
          'delete_memory_asset',
          'scan_and_extract_patterns',
        ]),
      );

    } finally {
      await client.close().catch(() => undefined);
      await runtime.server.close().catch(() => undefined);
    }
  });

  test('does not attach UI metadata when the client does not negotiate MCP Apps', async () => {
    vi.stubEnv('MCP_TOOLSET', 'compact');
    vi.stubEnv('MEMORY_QDRANT_URL', '');
    vi.stubEnv('MEMORY_EMBEDDING_URL', '');

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const runtime = createProbeServer({ protocolMode: 'auto' });
    const client = new Client(
      { name: 'plain-client', version: '1.0.0' },
      { capabilities: {} },
    );
    await runtime.server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(24);
      expect(tools.tools.find((tool) => tool.name === 'start_feature')?._meta?.ui).toBeUndefined();
      expect(tools.tools.some((tool) => tool.name === 'list_memory_assets')).toBe(false);
      const resources = await client.listResources();
      expect(resources.resources.some((resource) => resource.uri.startsWith('ui://'))).toBe(false);
      const appOnlyResult = await client.callTool({
        name: 'list_memory_assets',
        arguments: { limit: 10 },
      });
      expect(appOnlyResult.isError).toBe(true);
    } finally {
      await client.close().catch(() => undefined);
      await runtime.server.close().catch(() => undefined);
    }
  });
});
