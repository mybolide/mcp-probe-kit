import * as fs from "node:fs";
import * as path from "node:path";
import { attachHandles } from "../lib/handles.js";
import type { ResourceContent, ToolResult } from "../server/runtime-types.js";

interface GraphSnapshot {
  id: string;
  uri: string;
  toolName: string;
  createdAt: string;
  status: string;
  summary: string;
  payload: unknown;
  jsonFilePath?: string;
  markdownFilePath?: string;
}

export class GraphSnapshotStore {
  private readonly snapshots = new Map<string, GraphSnapshot>();
  private readonly order: string[] = [];

  constructor(
    readonly snapshotDir: string,
    private readonly maxSnapshots = 20
  ) {}

  decorate(toolName: string, result: ToolResult): ToolResult {
    const snapshot = this.remember(toolName, result);
    if (!snapshot) {
      return result;
    }

    const currentGraphMeta = result._meta?.graph;
    const graphMeta =
      currentGraphMeta && typeof currentGraphMeta === "object"
        ? (currentGraphMeta as Record<string, unknown>)
        : {};
    const withMeta: ToolResult = {
      ...result,
      _meta: {
        ...(result._meta ?? {}),
        graph: {
          ...graphMeta,
          snapshotUri: snapshot.uri,
          snapshotId: snapshot.id,
          status: snapshot.status,
          createdAt: snapshot.createdAt,
          jsonFilePath: snapshot.jsonFilePath ?? null,
          markdownFilePath: snapshot.markdownFilePath ?? null,
        },
      },
    };

    if (
      !withMeta.structuredContent ||
      typeof withMeta.structuredContent !== "object" ||
      Array.isArray(withMeta.structuredContent)
    ) {
      return withMeta;
    }

    return {
      ...withMeta,
      structuredContent: attachHandles(
        withMeta.structuredContent as Record<string, unknown>,
        {
          graph_snapshot: snapshot.uri,
          graph_resource: snapshot.uri,
        }
      ),
    };
  }

  private toPersistedJson(snapshot: GraphSnapshot) {
    return {
      id: snapshot.id,
      uri: snapshot.uri,
      toolName: snapshot.toolName,
      createdAt: snapshot.createdAt,
      status: snapshot.status,
      summary: snapshot.summary,
      payload: snapshot.payload,
    };
  }

  status() {
    const latest = this.latest();
    return {
      count: this.order.length,
      snapshotDir: toPosixPath(this.snapshotDir),
      latest: latest
        ? {
            id: latest.id,
            uri: latest.uri,
            toolName: latest.toolName,
            status: latest.status,
            summary: trimText(latest.summary, 140),
            createdAt: latest.createdAt,
            jsonFilePath: latest.jsonFilePath ?? null,
            markdownFilePath: latest.markdownFilePath ?? null,
          }
        : null,
    };
  }

  read(uri: string): ResourceContent | null {
    if (uri === "probe://graph/latest") {
      const snapshot = this.latest();
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          snapshot
            ? {
                ...this.toJson(snapshot),
                history: this.history(),
                fileIndex: this.fileIndex(),
                relatedUris: {
                  markdown: "probe://graph/latest.md",
                  history: "probe://graph/history",
                  files: "probe://graph/files",
                },
              }
            : {
                status: "empty",
                message: "暂无图谱快照，请先调用 code_insight 或 start_feature/start_bugfix。",
              },
          null,
          2
        ),
      };
    }

    if (uri === "probe://graph/latest.md") {
      const snapshot = this.latest();
      const text = snapshot
        ? snapshot.markdownFilePath && fs.existsSync(snapshot.markdownFilePath)
          ? fs.readFileSync(snapshot.markdownFilePath, "utf-8")
          : this.renderMarkdown(snapshot)
        : "# Graph Snapshot\n\n暂无图谱快照，请先调用 code_insight 或 start_feature/start_bugfix。";
      return { uri, mimeType: "text/markdown", text };
    }

    if (uri === "probe://graph/history") {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(this.history(), null, 2),
      };
    }

    if (uri === "probe://graph/files") {
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(this.fileIndex(), null, 2),
      };
    }

    if (!uri.startsWith("probe://graph/")) {
      return null;
    }

    const id = uri.slice("probe://graph/".length);
    if (!id || ["latest", "history", "files", "latest.md"].includes(id)) {
      throw new Error(`未知图谱资源: ${uri}`);
    }
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      throw new Error(`图谱快照不存在: ${id}`);
    }
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(this.toJson(snapshot), null, 2),
    };
  }

  private latest(): GraphSnapshot | null {
    const id = this.order[this.order.length - 1];
    return id ? this.snapshots.get(id) ?? null : null;
  }

  private remember(toolName: string, result: ToolResult): GraphSnapshot | null {
    const graph = readGraphPayload(toolName, result);
    if (!graph) {
      return null;
    }

    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const snapshot = this.persist({
      id,
      uri: `probe://graph/${id}`,
      toolName,
      createdAt: new Date().toISOString(),
      status: graph.status,
      summary: graph.summary,
      payload: graph.payload,
    });
    this.snapshots.set(id, snapshot);
    this.order.push(id);
    while (this.order.length > this.maxSnapshots) {
      const oldest = this.order.shift();
      if (oldest) this.snapshots.delete(oldest);
    }
    return snapshot;
  }

  private persist(snapshot: GraphSnapshot): GraphSnapshot {
    try {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
      const baseName = `${snapshot.id}-${safeSegment(snapshot.toolName)}`;
      const jsonPath = path.join(this.snapshotDir, `${baseName}.json`);
      const markdownPath = path.join(this.snapshotDir, `${baseName}.md`);
      fs.writeFileSync(jsonPath, JSON.stringify(this.toPersistedJson(snapshot), null, 2), "utf-8");
      fs.writeFileSync(markdownPath, this.renderMarkdown(snapshot), "utf-8");
      return {
        ...snapshot,
        jsonFilePath: toPosixPath(jsonPath),
        markdownFilePath: toPosixPath(markdownPath),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[MCP Probe Kit] graph snapshot persist failed: ${message}`);
      return snapshot;
    }
  }

  private history(summaryLimit = 200) {
    const items = this.order
      .slice()
      .reverse()
      .map((id) => this.snapshots.get(id))
      .filter((item): item is GraphSnapshot => Boolean(item))
      .map((item) => ({
        id: item.id,
        uri: item.uri,
        toolName: item.toolName,
        createdAt: item.createdAt,
        status: item.status,
        summary: trimText(item.summary, summaryLimit),
        files: {
          json: item.jsonFilePath ?? null,
          markdown: item.markdownFilePath ?? null,
        },
      }));
    return { count: items.length, items };
  }

  private fileIndex(fileLimit = 40) {
    const latest = this.latest();
    const exists = fs.existsSync(this.snapshotDir);
    const files = exists
      ? fs
          .readdirSync(this.snapshotDir, { withFileTypes: true })
          .filter((entry) => entry.isFile() && /\.(json|md)$/i.test(entry.name))
          .map((entry) => toPosixPath(path.join(this.snapshotDir, entry.name)))
          .sort((a, b) => b.localeCompare(a))
          .slice(0, fileLimit)
      : [];
    return {
      snapshotDir: toPosixPath(this.snapshotDir),
      exists,
      latest: latest
        ? {
            id: latest.id,
            uri: latest.uri,
            toolName: latest.toolName,
            jsonFilePath: latest.jsonFilePath ?? null,
            markdownFilePath: latest.markdownFilePath ?? null,
          }
        : null,
      files,
    };
  }

  private toJson(snapshot: GraphSnapshot) {
    return {
      id: snapshot.id,
      uri: snapshot.uri,
      toolName: snapshot.toolName,
      createdAt: snapshot.createdAt,
      status: snapshot.status,
      summary: snapshot.summary,
      payload: snapshot.payload,
      files: {
        json: snapshot.jsonFilePath ?? null,
        markdown: snapshot.markdownFilePath ?? null,
      },
    };
  }

  private renderMarkdown(snapshot: GraphSnapshot): string {
    return [
      "# Graph Snapshot",
      "",
      `- id: ${snapshot.id}`,
      `- tool: ${snapshot.toolName}`,
      `- status: ${snapshot.status}`,
      `- createdAt: ${snapshot.createdAt}`,
      `- summary: ${snapshot.summary}`,
      "",
      "## Payload",
      "```json",
      JSON.stringify(snapshot.payload, null, 2),
      "```",
      "",
    ].join("\n");
  }
}

function readGraphPayload(toolName: string, result: ToolResult) {
  if (result.isError) return null;

  if (
    toolName === "code_insight" &&
    result.structuredContent &&
    typeof result.structuredContent === "object"
  ) {
    const structured = result.structuredContent as Record<string, unknown>;
    return {
      status: typeof structured.status === "string" ? structured.status : "ok",
      summary:
        typeof structured.summary === "string" ? structured.summary : "code_insight 图谱结果",
      payload: sanitize(structured),
    };
  }

  if (
    (toolName === "start_feature" || toolName === "start_bugfix") &&
    result.structuredContent &&
    typeof result.structuredContent === "object"
  ) {
    const metadata = (result.structuredContent as Record<string, unknown>).metadata;
    if (!metadata || typeof metadata !== "object") return null;
    const graphContext = (metadata as Record<string, unknown>).graphContext;
    if (!graphContext || typeof graphContext !== "object") return null;
    const graphRecord = graphContext as Record<string, unknown>;
    return {
      status: graphRecord.available === false ? "degraded" : "ok",
      summary:
        typeof graphRecord.summary === "string"
          ? graphRecord.summary
          : `${toolName} 图谱上下文`,
      payload: sanitize({
        graphContext,
        plan: (metadata as Record<string, unknown>).plan ?? null,
      }),
    };
  }
  return null;
}

function sanitize(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return payload.slice(0, 20).map(sanitize);

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof value === "string") {
      next[key] = trimText(value, 6000);
    } else if (key === "executions" && Array.isArray(value)) {
      next[key] = value.slice(0, 8).map((item) => {
        if (!item || typeof item !== "object") return item;
        const exec = item as Record<string, unknown>;
        return {
          ...exec,
          text: typeof exec.text === "string" ? trimText(exec.text, 6000) : exec.text,
        };
      });
    } else {
      next[key] = sanitize(value);
    }
  }
  return next;
}

function trimText(value: string, maxLen: number): string {
  return value.length <= maxLen ? value : `${value.slice(0, maxLen - 3)}...`;
}

function safeSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "snapshot"
  );
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}
