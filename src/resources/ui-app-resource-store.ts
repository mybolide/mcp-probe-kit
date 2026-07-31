import {
  MCP_APP_MIME_TYPE,
  MCP_APP_RESOURCES,
  buildMcpAppHtml,
  getMcpAppResource,
} from '../lib/mcp-apps.js';
import type { ResourceContent, ToolResult } from '../server/runtime-types.js';

export class UiAppResourceStore {
  constructor(readonly enabled: boolean) {}

  decorate(_toolName: string, _args: unknown, result: ToolResult): ToolResult {
    return result;
  }

  list() {
    if (!this.enabled) return [];
    return MCP_APP_RESOURCES.map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: MCP_APP_MIME_TYPE,
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [],
            resourceDomains: [],
            frameDomains: [],
            baseUriDomains: [],
          },
        },
      },
    }));
  }

  read(uri: string): ResourceContent | null {
    if (!this.enabled) return null;
    const resource = getMcpAppResource(uri);
    if (!resource) return null;
    return {
      uri: resource.uri,
      mimeType: MCP_APP_MIME_TYPE,
      text: buildMcpAppHtml(resource),
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [],
            resourceDomains: [],
            frameDomains: [],
            baseUriDomains: [],
          },
        },
      },
    };
  }
}
