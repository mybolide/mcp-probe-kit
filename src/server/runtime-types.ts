export interface ToolResult {
  content?: unknown;
  isError?: boolean;
  structuredContent?: unknown;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
  _meta?: Record<string, unknown>;
}
