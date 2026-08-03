import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { buildManagedGitNexusProcessEnv } from "../build/lib/gitnexus-runtime-config.js";

const root = path.resolve(import.meta.dirname, "..");
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-gitnexus-runtime-"));
const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-gitnexus-repo-"));
const indexJs = path.join(root, "build", "index.js");
const env = {
  ...process.env,
  MCP_GITNEXUS_RUNTIME_ROOT: runtimeRoot,
  MCP_GITNEXUS_PACKAGE_MANAGER: process.env.MCP_GITNEXUS_PACKAGE_MANAGER || "pnpm",
  MCP_GITNEXUS_INSTALL_TIMEOUT_MS: "600000",
  GITNEXUS_SKIP_OPTIONAL_GRAMMARS: "1",
};

let client;
let transport;
let cliPath;
try {
  const install = run(process.execPath, [indexJs, "doctor", "gitnexus", "--install"], root, env, 660_000);
  const doctor = JSON.parse(install.stdout);
  if (
    !doctor.ok
    || !doctor.managed?.valid
    || doctor.managed?.manifest?.version !== doctor.compatibility?.version
  ) {
    throw new Error(`Managed runtime validation failed: ${install.stdout}`);
  }
  cliPath = doctor.managed.cliPath;
  Object.assign(
    env,
    buildManagedGitNexusProcessEnv(doctor.compatibility, env, process.platform)
  );

  fs.writeFileSync(
    path.join(repoRoot, "package.json"),
    `${JSON.stringify({ name: "gitnexus-sidecar-smoke", private: true }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(repoRoot, "index.ts"),
    "export function add(a: number, b: number) { return a + b; }\n",
    "utf8"
  );
  run("git", ["init"], repoRoot, env);
  run("git", ["config", "user.email", "smoke@example.com"], repoRoot, env);
  run("git", ["config", "user.name", "GitNexus Sidecar Smoke"], repoRoot, env);
  run("git", ["add", "package.json", "index.ts"], repoRoot, env);
  run("git", ["commit", "-m", "initial"], repoRoot, env);

  const analyze = run(
    process.execPath,
    [cliPath, "analyze", "--skip-agents-md", ...(doctor.compatibility.analyzeArgs ?? [])],
    repoRoot,
    env,
    120_000
  );
  if (!/indexed successfully/i.test(analyze.stdout)) {
    throw new Error(`GitNexus analyze did not report success: ${analyze.stdout}\n${analyze.stderr}`);
  }

  transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, "mcp"],
    cwd: repoRoot,
    env,
    stderr: "pipe",
  });
  let serverStderr = "";
  transport.stderr?.on("data", (chunk) => {
    serverStderr = `${serverStderr}${String(chunk)}`.slice(-4_000);
  });
  client = new Client({ name: "gitnexus-sidecar-smoke", version: "1.0.0" });
  await client.connect(transport, { timeout: 30_000 });
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  const required = ["query", "context", "impact"];
  for (const name of required) {
    if (!names.includes(name)) throw new Error(`Missing GitNexus MCP tool: ${name}`);
  }
  const query = await client.callTool(
    { name: "query", arguments: { query: "add function", repo: path.basename(repoRoot) } },
    { timeout: 30_000 }
  );
  if (query.isError === true) {
    throw new Error(`GitNexus query failed: ${JSON.stringify(query)}`);
  }
  const queryText = Array.isArray(query.content)
    ? query.content
      .filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n")
    : "";
  const queryReturnedDefinition =
    /"name"\s*:\s*"add"/.test(queryText)
    && /"filePath"\s*:\s*"index\.ts"/.test(queryText);
  if (!queryReturnedDefinition) {
    throw new Error(`GitNexus query did not return add/index.ts: ${queryText.slice(0, 1_000)}`);
  }
  const context = await client.callTool(
    { name: "context", arguments: { name: "add", repo: path.basename(repoRoot) } },
    { timeout: 30_000 }
  );
  if (context.isError === true) {
    throw new Error(`GitNexus context failed: ${JSON.stringify(context)}`);
  }
  const impact = await client.callTool(
    {
      name: "impact",
      arguments: {
        target: "Function:index.ts:add",
        direction: "upstream",
        repo: path.basename(repoRoot),
      },
    },
    { timeout: 30_000 }
  );
  if (impact.isError === true) {
    throw new Error(`GitNexus impact failed: ${JSON.stringify(impact)}`);
  }

  console.log(JSON.stringify({
    passed: true,
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    managedVersion: doctor.managed.manifest.version,
    installer: doctor.managed.manifest.installer,
    toolCount: names.length,
    requiredTools: Object.fromEntries(required.map((name) => [name, true])),
    queryReturnedDefinition,
    contextSucceeded: context.isError !== true,
    impactSucceeded: impact.isError !== true,
    serverStderr: serverStderr.slice(-1_000),
  }, null, 2));
} finally {
  try { await client?.close(); } catch { /* ignore */ }
  if (cliPath) {
    try { run(process.execPath, [cliPath, "clean", "--force"], repoRoot, env, 30_000); } catch { /* ignore */ }
  }
  fs.rmSync(repoRoot, { recursive: true, force: true });
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
}

function run(command, args, cwd, childEnv, timeout = 30_000) {
  const result = spawnSync(command, args, {
    cwd,
    env: childEnv,
    encoding: "utf8",
    windowsHide: true,
    timeout,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}):\n${result.stderr || result.stdout}`
    );
  }
  return result;
}
