import * as fs from "node:fs";
import * as path from "node:path";
import {
  ensureMcpProbeKitBootstrap,
  type McpProbeKitBootstrapResult,
} from "./workflow-skill-installer.js";
import { MCP_PROBE_SKILL_REL_PATH } from "./workflow-skill-template.js";
import { resolveProjectContextLayout, toPosixPath } from "./project-context-layout.js";
import { resolveWorkspaceRoot } from "./workspace-root.js";

export const PROJECT_BOOTSTRAP_URI = "probe://project/bootstrap";
export const PROJECT_RESOURCE_PREFIX = "probe://project/";

const DEFAULT_MAX_FILE_BYTES = 512 * 1024;

export type ProjectResourceId = "skill" | "agents" | "context" | "graph";

export interface ProjectResourceEntry {
  id: ProjectResourceId;
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  fileRel: string;
  exists: boolean;
}

export interface ProjectResourcesSnapshot {
  projectRoot: string;
  bootstrap: McpProbeKitBootstrapResult;
  resources: ProjectResourceEntry[];
}

function getMaxFileBytes(): number {
  const raw = process.env.MCP_PROJECT_RESOURCE_MAX_BYTES?.trim();
  if (!raw) {
    return DEFAULT_MAX_FILE_BYTES;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_FILE_BYTES;
}

function fileExists(projectRoot: string, rel: string): boolean {
  try {
    return fs.existsSync(path.join(projectRoot, rel)) && fs.statSync(path.join(projectRoot, rel)).isFile();
  } catch {
    return false;
  }
}

function buildResourceEntries(
  projectRoot: string,
  layout: ReturnType<typeof resolveProjectContextLayout>
): ProjectResourceEntry[] {
  const skillRel = MCP_PROBE_SKILL_REL_PATH;
  const agentsRel = toPosixPath(layout.indexPath);
  const contextRel =
    layout.indexStyle === "legacy"
      ? toPosixPath(layout.legacyIndexPath)
      : agentsRel;
  const graphRel = toPosixPath(layout.latestMarkdownPath);

  const defs: Array<Omit<ProjectResourceEntry, "exists">> = [
    {
      id: "skill",
      uri: `${PROJECT_RESOURCE_PREFIX}skill`,
      name: "MCP 调用时机 Skill",
      description: "自动维护的 .agents/skills/mcp-probe-kit/SKILL.md",
      mimeType: "text/markdown",
      fileRel: skillRel,
    },
    {
      id: "agents",
      uri: `${PROJECT_RESOURCE_PREFIX}agents`,
      name: "AGENTS.md",
      description: "项目 Agent 规则与 mcp-probe 上下文块",
      mimeType: "text/markdown",
      fileRel: agentsRel,
    },
    {
      id: "context",
      uri: `${PROJECT_RESOURCE_PREFIX}context`,
      name: "项目上下文索引",
      description: "AGENTS.md 或 docs/project-context.md 入口",
      mimeType: "text/markdown",
      fileRel: contextRel,
    },
    {
      id: "graph",
      uri: `${PROJECT_RESOURCE_PREFIX}graph`,
      name: "图谱洞察（最新）",
      description: "docs/graph-insights/latest.md（存在时）",
      mimeType: "text/markdown",
      fileRel: graphRel,
    },
  ];

  return defs.map((item) => ({
    ...item,
    exists: fileExists(projectRoot, item.fileRel),
  }));
}

/**
 * 只读发现项目资源（不写盘）。用于 resources/list、probe://status 等热路径。
 */
export function discoverProjectResources(projectRoot?: string): Omit<ProjectResourcesSnapshot, "bootstrap"> & {
  bootstrap?: never;
} {
  const root = path.resolve(projectRoot ?? resolveWorkspaceRoot(""));
  const layout = resolveProjectContextLayout(root);
  const resources = buildResourceEntries(root, layout);

  return {
    projectRoot: root,
    resources,
  };
}

/**
 * 自检并补齐 Skill + AGENTS.md，再按约定路径发现可读 Resource（按需调用，勿在 resources/list 中调用）。
 */
export function ensureAndDiscoverProjectResources(
  projectRoot?: string
): ProjectResourcesSnapshot {
  const root = path.resolve(projectRoot ?? resolveWorkspaceRoot(""));
  const bootstrap = ensureMcpProbeKitBootstrap(root);
  const layout = resolveProjectContextLayout(root);
  const resources = buildResourceEntries(root, layout);

  return {
    projectRoot: root,
    bootstrap,
    resources,
  };
}

export function buildProjectBootstrapPayload(snapshot: ProjectResourcesSnapshot) {
  const { bootstrap, resources } = snapshot;
  return {
    projectRoot: toPosixPath(snapshot.projectRoot),
    autoBootstrap: {
      skill: {
        path: bootstrap.skill.skillRelPath,
        created: bootstrap.skill.created,
        updated: bootstrap.skill.updated,
        version: bootstrap.skill.version,
      },
      agentsMd: {
        path: toPosixPath(bootstrap.agentsMd.path),
        created: bootstrap.agentsMd.created,
        updated: bootstrap.agentsMd.updated,
      },
      workspaceWarning: bootstrap.workspaceWarning ?? null,
    },
    resources: resources.map((item) => ({
      id: item.id,
      uri: item.uri,
      name: item.name,
      description: item.description,
      mimeType: item.mimeType,
      file: item.fileRel,
      exists: item.exists,
    })),
    readHint:
      "无需配置文件。resources/read 按需读取 probe://project/skill、agents、context、graph；缺失项会在 tools/list 或工具调用时自动补齐。",
  };
}

export function resolveProjectResourceId(uri: string): ProjectResourceId | null {
  if (!uri.startsWith(PROJECT_RESOURCE_PREFIX)) {
    return null;
  }
  const tail = uri.slice(PROJECT_RESOURCE_PREFIX.length);
  if (tail === "bootstrap") {
    return null;
  }
  if (tail === "skill" || tail === "agents" || tail === "context" || tail === "graph") {
    return tail;
  }
  return null;
}

export function readProjectResourceContent(
  uri: string,
  projectRoot?: string
): { uri: string; mimeType: string; text: string } | null {
  if (uri === PROJECT_BOOTSTRAP_URI) {
    const snapshot = ensureAndDiscoverProjectResources(projectRoot);
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify(buildProjectBootstrapPayload(snapshot), null, 2),
    };
  }

  const id = resolveProjectResourceId(uri);
  if (!id) {
    return null;
  }

  const snapshot = ensureAndDiscoverProjectResources(projectRoot);
  const entry = snapshot.resources.find((item) => item.id === id);
  if (!entry) {
    throw new Error(`未知项目 resource: ${uri}`);
  }
  if (!entry.exists) {
    throw new Error(
      `项目 resource 文件尚不存在: ${entry.fileRel}（可先调用 init_project_context 或任意 MCP 工具触发自动补齐）`
    );
  }

  const absPath = path.join(snapshot.projectRoot, entry.fileRel);
  const stat = fs.statSync(absPath);
  const maxBytes = getMaxFileBytes();
  if (stat.size > maxBytes) {
    throw new Error(`文件过大 (${stat.size} > ${maxBytes} bytes): ${entry.fileRel}`);
  }

  return {
    uri: entry.uri,
    mimeType: entry.mimeType,
    text: fs.readFileSync(absPath, "utf-8"),
  };
}
