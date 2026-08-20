import * as fs from "node:fs";
import * as path from "node:path";
import { resolveWorkspaceRootWithMeta } from "./workspace-root.js";

export const CLI_LOCAL_ENV_REL_PATH = ".mcp-probe-kit/local.env";
export const CLI_LOCAL_ENV_EXAMPLE_REL_PATH = ".mcp-probe-kit/local.env.example";

export const CLI_LOCAL_ENV_EXAMPLE_CONTENT = `# MCP Probe Kit — local env for CLI fallback
# Copy this file to local.env and uncomment values you need.
# This file is loaded only for .mcp-probe-kit/bin/probe.* exec.
# Env from Cursor/IDE mcp.json is not inherited by terminal probe exec.
# Existing shell/system env values always win and are never overridden.
#
# Memory tools (search_memory / memorize_asset / update_memory_asset)
# MEMORY_QDRANT_URL=http://127.0.0.1:50008
# MEMORY_EMBEDDING_URL=http://127.0.0.1:50012/v1
# MEMORY_EMBEDDING_MODEL=nomic-embed-text
# MEMORY_EMBEDDING_PROVIDER=openai-compatible
# MEMORY_QDRANT_COLLECTION=mcp_probe_memory
# MEMORY_REPO_ID=
#
# Optional GitNexus runtime preference
# MCP_GITNEXUS_MODE=managed
`;

export const CLI_LOCAL_ENV_CONTENT = CLI_LOCAL_ENV_EXAMPLE_CONTENT;

export function parseDotEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function applyCliLocalEnv(
  projectRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): { loadedFrom?: string; appliedKeys: string[] } {
  const envPath = path.join(path.resolve(projectRoot), CLI_LOCAL_ENV_REL_PATH);
  if (!fs.existsSync(envPath)) {
    return { appliedKeys: [] };
  }

  let content = "";
  try {
    content = fs.readFileSync(envPath, "utf8");
  } catch {
    return { appliedKeys: [] };
  }

  const parsed = parseDotEnvContent(content);
  const appliedKeys: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    const existing = env[key];
    if (existing === undefined || existing === "") {
      env[key] = value;
      appliedKeys.push(key);
    }
  }

  return {
    loadedFrom: envPath,
    appliedKeys,
  };
}

export function bootstrapCliLocalEnv(): {
  loadedFrom?: string;
  appliedKeys: string[];
} {
  const roots: string[] = [];
  const seen = new Set<string>();

  const pushRoot = (value: string | undefined) => {
    if (!value?.trim()) return;
    const resolved = path.resolve(value.trim());
    if (seen.has(resolved)) return;
    seen.add(resolved);
    roots.push(resolved);
  };

  try {
    const workspace = resolveWorkspaceRootWithMeta(undefined);
    if (workspace.source !== "package-fallback") {
      pushRoot(workspace.root);
    }
  } catch {
    // Ignore workspace probing failures; cwd fallback still applies.
  }
  pushRoot(process.cwd());

  let loadedFrom: string | undefined;
  const appliedKeys: string[] = [];
  for (const root of roots) {
    const outcome = applyCliLocalEnv(root);
    if (outcome.loadedFrom) {
      loadedFrom = outcome.loadedFrom;
    }
    for (const key of outcome.appliedKeys) {
      if (!appliedKeys.includes(key)) {
        appliedKeys.push(key);
      }
    }
  }

  return { loadedFrom, appliedKeys };
}

export function ensureCliLocalEnvExample(projectRoot: string): {
  path: string;
  created: boolean;
} {
  const absolute = path.join(path.resolve(projectRoot), CLI_LOCAL_ENV_EXAMPLE_REL_PATH);
  if (fs.existsSync(absolute)) {
    return { path: CLI_LOCAL_ENV_EXAMPLE_REL_PATH, created: false };
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, CLI_LOCAL_ENV_EXAMPLE_CONTENT, "utf8");
  return { path: CLI_LOCAL_ENV_EXAMPLE_REL_PATH, created: true };
}

export function ensureCliLocalEnvTemplate(projectRoot: string): {
  path: string;
  created: boolean;
} {
  const absolute = path.join(path.resolve(projectRoot), CLI_LOCAL_ENV_REL_PATH);
  if (fs.existsSync(absolute)) {
    return { path: CLI_LOCAL_ENV_REL_PATH, created: false };
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, CLI_LOCAL_ENV_CONTENT, "utf8");
  return { path: CLI_LOCAL_ENV_REL_PATH, created: true };
}
