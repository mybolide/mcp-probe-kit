import * as fs from "node:fs";
import * as path from "node:path";
import { VERSION } from "../version.js";
import {
  getToolDefinition,
  listToolDefinitionsForToolset,
  prepareRegisteredToolForList,
  executeRegisteredTool,
} from "../server/tool-registry.js";
import { getToolsetFromEnv } from "../lib/toolset-manager.js";
import { ensureMcpProbeKitBootstrap } from "../lib/workflow-skill-installer.js";
import {
  resolveWorkspaceRootWithMeta,
  type WorkspaceRootResolution,
} from "../lib/workspace-root.js";
import {
  CLI_RUNTIME_MANIFEST_REL_PATH,
  readCliRuntimeManifest,
} from "../lib/cli-fallback-installer.js";
import {
  MCP_PROBE_SKILL_REL_PATH,
} from "../lib/workflow-skill-template.js";
import {
  compareSemver,
  parseSkillInstalledVersion,
} from "../lib/workflow-skill-version.js";
import {
  ensureManagedGitNexusRuntime,
  findSystemGitNexusCli,
  inspectManagedGitNexusRuntime,
  resolveGitForWindowsRuntimeBin,
  resolveCompatibleGitNexus,
  resolveGitNexusMode,
  tryResolveCompatibleGitNexus,
} from "../lib/gitnexus-runtime-manager.js";

interface ParsedArgv {
  command: string;
  positionals: string[];
  flags: Map<string, string | boolean>;
}

class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
  }
}

export async function runCommandLine(argv: string[]): Promise<number | null> {
  if (argv.length === 0) return null;

  const parsed = parseArgv(argv);
  try {
    if (parsed.flags.has("help")) return runScopedHelp(parsed);
    switch (parsed.command) {
      case "exec":
        return await runExec(parsed);
      case "tools":
        return runTools();
      case "schema":
        return runSchema(parsed);
      case "install-agent":
        return runInstallAgent(parsed);
      case "status":
        return runStatus(parsed);
      case "doctor":
        return await runDoctor(parsed);
      case "help":
      case "--help":
      case "-h":
        printHelp();
        return 0;
      case "version":
      case "--version":
      case "-v":
        process.stdout.write(`${VERSION}\n`);
        return 0;
      default:
        throw new CliError(
          "UNKNOWN_COMMAND",
          `未知命令: ${parsed.command}`,
          { supported: ["exec", "tools", "schema", "install-agent", "status", "doctor"] }
        );
    }
  } catch (error) {
    const normalized = normalizeError(error);
    writeJson({ ok: false, ...normalized });
    return 1;
  }
}

async function runExec(parsed: ParsedArgv): Promise<number> {
  const toolName = parsed.positionals[0]?.trim();
  if (!toolName) {
    throw new CliError("TOOL_REQUIRED", "exec 命令需要工具名，例如 exec workflow --stdin");
  }
  if (!getToolDefinition(toolName)) {
    throw new CliError("UNKNOWN_TOOL", `未知工具: ${toolName}`);
  }

  const startedAt = Date.now();
  const input = await readJsonInput(parsed.flags);
  const explicitProjectRoot = flagString(parsed.flags, "project-root");
  if (explicitProjectRoot) input.project_root = explicitProjectRoot;
  const project = resolveCliProject(input);
  input.project_root = project.root;

  const bootstrap = ensureMcpProbeKitBootstrap(project.root);
  const cliFallback = requireCliFallback(bootstrap.cliFallback);
  assertRuntimeVersionAligned(project.root, cliFallback.version);

  const result = await executeRegisteredTool(toolName, input, { bootstrap });
  const ok = result.isError !== true;
  writeJson({
    ok,
    tool: toolName,
    version: VERSION,
    durationMs: Date.now() - startedAt,
    project: summarizeProject(project),
    runtime: {
      packageVersion: VERSION,
      manifestVersion: cliFallback.version,
      packageSpec: cliFallback.packageSpec,
      skillVersion: bootstrap.skill.version,
      versionAligned:
        compareSemver(cliFallback.version, VERSION) === 0 &&
        compareSemver(bootstrap.skill.version, VERSION) === 0,
    },
    bootstrap: {
      skill: summarizeWriteResult(bootstrap.skill),
      agentsMd: summarizeWriteResult(bootstrap.agentsMd),
      cliFallback: {
        manifestPath: cliFallback.manifestPath,
        preservedNewerVersion: cliFallback.preservedNewerVersion,
        files: cliFallback.files,
      },
    },
    content: result.content,
    structuredContent: result.structuredContent,
    isError: result.isError ?? false,
    _meta: result._meta,
  });
  return ok ? 0 : 1;
}

function runTools(): number {
  const toolset = getToolsetFromEnv();
  const tools = listToolDefinitionsForToolset(toolset).map((definition) =>
    prepareRegisteredToolForList(definition)
  );
  writeJson({
    ok: true,
    version: VERSION,
    toolset,
    count: tools.length,
    tools,
  });
  return 0;
}

function runSchema(parsed: ParsedArgv): number {
  const toolName = parsed.positionals[0]?.trim();
  if (!toolName) {
    throw new CliError("TOOL_REQUIRED", "schema 命令需要工具名，例如 schema start_feature");
  }
  const definition = getToolDefinition(toolName);
  if (!definition) throw new CliError("UNKNOWN_TOOL", `未知工具: ${toolName}`);
  writeJson({
    ok: true,
    version: VERSION,
    tool: toolName,
    description: definition.schema.description,
    inputSchema: definition.schema.inputSchema,
    outputSchema: definition.outputSchema,
    annotations: definition.annotations,
    toolsets: definition.toolsets,
  });
  return 0;
}

function runInstallAgent(parsed: ParsedArgv): number {
  const explicitProjectRoot = flagString(parsed.flags, "project-root");
  const project = resolveRequiredWorkspace(explicitProjectRoot);
  const bootstrap = ensureMcpProbeKitBootstrap(project.root);
  const cliFallback = requireCliFallback(bootstrap.cliFallback);
  assertRuntimeVersionAligned(project.root, cliFallback.version);
  writeJson({
    ok: true,
    version: VERSION,
    project: summarizeProject(project),
    installed: {
      skill: summarizeWriteResult(bootstrap.skill),
      agentsMd: summarizeWriteResult(bootstrap.agentsMd),
      cliFallback,
      harness: bootstrap.harness,
    },
  });
  return 0;
}

function runStatus(parsed: ParsedArgv): number {
  const explicitProjectRoot = flagString(parsed.flags, "project-root");
  const project = resolveRequiredWorkspace(explicitProjectRoot);
  const manifest = readCliRuntimeManifest(project.root);
  const skillPath = path.join(project.root, MCP_PROBE_SKILL_REL_PATH);
  const skillVersion = fs.existsSync(skillPath)
    ? parseSkillInstalledVersion(fs.readFileSync(skillPath, "utf8"))
    : null;
  writeJson({
    ok: true,
    version: VERSION,
    project: summarizeProject(project),
    runtime: {
      manifestPath: CLI_RUNTIME_MANIFEST_REL_PATH,
      manifest,
      skillPath: MCP_PROBE_SKILL_REL_PATH,
      skillVersion,
      versionAligned:
        manifest?.version === VERSION && skillVersion === VERSION,
    },
  });
  return 0;
}

async function runDoctor(parsed: ParsedArgv): Promise<number> {
  const component = parsed.positionals[0]?.trim() || "gitnexus";
  if (component !== "gitnexus") {
    throw new CliError("UNKNOWN_DOCTOR_COMPONENT", `未知 doctor 组件: ${component}`, {
      supported: ["gitnexus"],
    });
  }

  const mode = resolveGitNexusMode();
  const compatibility = tryResolveCompatibleGitNexus();
  const systemCli = findSystemGitNexusCli();
  const windowsRuntimeBin = resolveGitForWindowsRuntimeBin();
  const explicitCommand = process.env.MCP_GITNEXUS_COMMAND?.trim() || null;
  let managed: ReturnType<typeof inspectManagedGitNexusRuntime> | Awaited<ReturnType<typeof ensureManagedGitNexusRuntime>> | undefined;

  if (compatibility) {
    managed = inspectManagedGitNexusRuntime();
    if (parsed.flags.has("install")) {
      managed = await ensureManagedGitNexusRuntime();
    }
  } else if (parsed.flags.has("install")) {
    throw new CliError(
      "GITNEXUS_MANAGED_NODE_UNSUPPORTED",
      `GitNexus 托管 Sidecar 要求 Node.js >= 22，当前为 ${process.versions.node}`,
      { fallback: "使用系统 GitNexus CLI，或继续降级运行核心工作流" }
    );
  }

  const selectedStrategy = explicitCommand
    ? "env"
    : mode === "off"
      ? "disabled"
      : managed?.valid
        ? "managed"
        : systemCli
          ? "local"
          : mode === "system"
            ? "disabled"
            : compatibility
              ? "managed_pending"
              : "managed_unsupported";

  writeJson({
    ok: true,
    version: VERSION,
    component: "gitnexus",
    mode,
    node: {
      version: process.versions.node,
      platform: process.platform,
      arch: process.arch,
    },
    compatibility: compatibility || {
      supported: false,
      minimumNodeMajor: 22,
      reason: "managed_node_unsupported",
    },
    explicitCommand,
    systemCli: systemCli || null,
    windowsRuntime: process.platform === "win32"
      ? {
          available: Boolean(windowsRuntimeBin),
          bin: windowsRuntimeBin || null,
          purpose: "LadybugDB FTS OpenSSL runtime",
        }
      : null,
    selectedStrategy,
    managed: managed
      ? {
          installed: managed.installed,
          valid: managed.valid,
          installedNow: "installedNow" in managed ? managed.installedNow : false,
          reason: managed.reason,
          runtimeRoot: managed.runtimeRoot,
          installRoot: managed.installRoot,
          manifestPath: managed.manifestPath,
          cliPath: managed.cliPath,
          manifest: managed.manifest,
        }
      : {
          installed: false,
          valid: false,
          installedNow: false,
          reason: "managed_node_unsupported",
        },
    policy: {
      bundledInMainPackage: false,
      automaticGlobalInstall: false,
      packageJsonMutation: false,
      exactVersion: true,
      integrityPinned: true,
      managedMinimumNodeMajor: 22,
      license: compatibility?.license || "PolyForm-Noncommercial-1.0.0",
    },
  });
  return 0;
}

function runScopedHelp(parsed: ParsedArgv): number {
  if (parsed.command === "exec" && parsed.positionals[0]) {
    return runSchema({ ...parsed, command: "schema", positionals: [parsed.positionals[0]] });
  }
  if (parsed.command === "doctor") {
    process.stdout.write("用法:\n  mcp-probe-kit doctor gitnexus [--install]\n");
    return 0;
  }
  printHelp();
  return 0;
}

function parseArgv(argv: string[]): ParsedArgv {
  const command = argv[0] ?? "help";
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "-h") {
      flags.set("help", true);
      continue;
    }
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const equalsIndex = token.indexOf("=");
    if (equalsIndex > 2) {
      flags.set(token.slice(2, equalsIndex), token.slice(equalsIndex + 1));
      continue;
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(name, next);
      index += 1;
    } else {
      flags.set(name, true);
    }
  }
  return { command, positionals, flags };
}

async function readJsonInput(flags: Map<string, string | boolean>): Promise<Record<string, unknown>> {
  const sources = [
    flags.has("stdin") ? "stdin" : null,
    flags.has("input") ? "input" : null,
    flags.has("json") ? "json" : null,
  ].filter(Boolean);
  if (sources.length > 1) {
    throw new CliError(
      "MULTIPLE_INPUT_SOURCES",
      "--stdin、--input、--json 只能选择一种"
    );
  }

  let raw = "{}";
  if (flags.has("stdin")) {
    raw = await readStdin();
  } else if (flags.has("input")) {
    const inputPath = flagString(flags, "input");
    if (!inputPath) throw new CliError("INPUT_PATH_REQUIRED", "--input 需要文件路径");
    raw = fs.readFileSync(path.resolve(inputPath), "utf8");
  } else if (flags.has("json")) {
    const inline = flagString(flags, "json");
    if (!inline) throw new CliError("JSON_REQUIRED", "--json 需要JSON字符串");
    raw = inline;
  }

  raw = raw.replace(/^\uFEFF/, "").trim();
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CliError("INVALID_JSON", "输入不是有效JSON", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError("JSON_OBJECT_REQUIRED", "工具参数必须是JSON对象");
  }
  return parsed as Record<string, unknown>;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function resolveCliProject(input: Record<string, unknown>): WorkspaceRootResolution {
  const requested = extractRequestedProjectRoot(input);
  const resolution = resolveWorkspaceRootWithMeta(requested);
  assertUsableWorkspace(resolution);
  return resolution;
}

function resolveRequiredWorkspace(explicitProjectRoot?: string): WorkspaceRootResolution {
  const resolution = resolveWorkspaceRootWithMeta(explicitProjectRoot);
  assertUsableWorkspace(resolution);
  return resolution;
}

function assertUsableWorkspace(resolution: WorkspaceRootResolution): void {
  if (resolution.source === "package-fallback") {
    throw new CliError(
      "PROJECT_ROOT_NOT_FOUND",
      "未识别到用户项目目录，请在项目目录运行或使用 --project-root 指定",
      { resolved: resolution.root, warning: resolution.warning }
    );
  }
  if (!fs.existsSync(resolution.root) || !fs.statSync(resolution.root).isDirectory()) {
    throw new CliError(
      "PROJECT_ROOT_NOT_FOUND",
      `项目目录不存在: ${resolution.root}`
    );
  }
}

function assertRuntimeVersionAligned(projectRoot: string, installedVersion: string): void {
  if (compareSemver(installedVersion, VERSION) > 0) {
    throw new CliError(
      "CLI_VERSION_MISMATCH",
      "项目已由更高版本的mcp-probe-kit初始化，当前旧版CLI拒绝执行和覆盖",
      {
        packageVersion: VERSION,
        manifestVersion: installedVersion,
        manifestPath: path.join(projectRoot, CLI_RUNTIME_MANIFEST_REL_PATH),
      }
    );
  }
}

function extractRequestedProjectRoot(input: Record<string, unknown>): string {
  for (const key of ["project_root", "projectRoot", "project_path"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function flagString(flags: Map<string, string | boolean>, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function summarizeProject(project: WorkspaceRootResolution) {
  return {
    root: project.root,
    source: project.source,
    explicitHonored: project.explicitHonored,
    warning: project.warning,
  };
}

function summarizeWriteResult<T extends { created: boolean; updated: boolean }>(result: T) {
  return {
    ...result,
    changed: result.created || result.updated,
  };
}

function requireCliFallback<T>(value: T | undefined): T {
  if (!value) {
    throw new CliError(
      "CLI_FALLBACK_INSTALL_FAILED",
      "项目CLI启动器未生成"
    );
  }
  return value;
}

function normalizeError(error: unknown) {
  if (error instanceof CliError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return {
    code: "CLI_EXECUTION_FAILED",
    message: error instanceof Error ? error.message : String(error),
  };
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp(): void {
  process.stdout.write(`mcp-probe-kit ${VERSION}\n\n`);
  process.stdout.write("用法:\n");
  process.stdout.write("  mcp-probe-kit                    启动MCP stdio服务\n");
  process.stdout.write("  mcp-probe-kit exec <tool> --stdin\n");
  process.stdout.write("  mcp-probe-kit exec <tool> --input request.json\n");
  process.stdout.write("  mcp-probe-kit exec <tool> --json '{...}'\n");
  process.stdout.write("  mcp-probe-kit tools\n");
  process.stdout.write("  mcp-probe-kit schema <tool>\n");
  process.stdout.write("  mcp-probe-kit install-agent --project-root .\n");
  process.stdout.write("  mcp-probe-kit status --project-root .\n");
  process.stdout.write("  mcp-probe-kit doctor gitnexus [--install]\n");
}
