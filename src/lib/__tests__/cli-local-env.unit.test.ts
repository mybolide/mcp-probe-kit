import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  applyCliLocalEnv,
  bootstrapCliLocalEnv,
  CLI_LOCAL_ENV_CONTENT,
  CLI_LOCAL_ENV_EXAMPLE_REL_PATH,
  CLI_LOCAL_ENV_REL_PATH,
  ensureCliLocalEnvExample,
  ensureCliLocalEnvTemplate,
  parseDotEnvContent,
} from "../cli-local-env.js";

const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "probe-cli-local-env-"));
  tempDirs.push(root);
  return root;
}

describe("cli-local-env", () => {
  test("parseDotEnvContent 忽略注释并解析 KEY=VALUE", () => {
    expect(
      parseDotEnvContent(`
# comment
MEMORY_QDRANT_URL=http://127.0.0.1:50008
MEMORY_EMBEDDING_MODEL="nomic-embed-text"
`),
    ).toEqual({
      MEMORY_QDRANT_URL: "http://127.0.0.1:50008",
      MEMORY_EMBEDDING_MODEL: "nomic-embed-text",
    });
  });

  test("cwd local.env is used before an unrelated detected workspace, without overwriting a shell value",()=>{
    const root=tempRoot();
    const other=tempRoot();
    for(const [dir,value] of [[root,"http://127.0.0.1:50008"],
      [other,"http://different-project:50008"]]){
      fs.mkdirSync(path.join(dir,".mcp-probe-kit"),{recursive:true});
      fs.writeFileSync(path.join(dir,CLI_LOCAL_ENV_REL_PATH),
        "MEMORY_QDRANT_URL="+value+"\n");
    }
    const cwd=process.cwd();
    vi.stubEnv("MCP_PROJECT_ROOT",undefined);
    vi.stubEnv("WORKSPACE_FOLDER_PATHS",other);
    vi.stubEnv("MEMORY_QDRANT_URL","");
    process.chdir(root);
    try{
      bootstrapCliLocalEnv();
      expect(process.env.MEMORY_QDRANT_URL).toBe("http://127.0.0.1:50008");
      vi.stubEnv("MEMORY_QDRANT_URL","http://shell-precedence:50008");
      const result=bootstrapCliLocalEnv();
      expect(result.appliedKeys).not.toContain("MEMORY_QDRANT_URL");
      expect(process.env.MEMORY_QDRANT_URL).toBe("http://shell-precedence:50008");
    }finally{process.chdir(cwd);}
  });

  test("an explicitly selected MCP_PROJECT_ROOT takes precedence over cwd local.env",()=>{
    const cwdProject=tempRoot();
    const selected=tempRoot();
    for(const [dir,value] of [[cwdProject,"http://cwd:50008"],
      [selected,"http://explicit:50008"]]){
      fs.mkdirSync(path.join(dir,".mcp-probe-kit"),{recursive:true});
      fs.writeFileSync(path.join(dir,CLI_LOCAL_ENV_REL_PATH),
        "MEMORY_QDRANT_URL="+value+"\n");
    }
    const cwd=process.cwd();
    vi.stubEnv("MCP_PROJECT_ROOT",selected);
    vi.stubEnv("MEMORY_QDRANT_URL","");
    process.chdir(cwdProject);
    try{
      expect(bootstrapCliLocalEnv().appliedKeys).toContain("MEMORY_QDRANT_URL");
      expect(process.env.MEMORY_QDRANT_URL).toBe("http://explicit:50008");
    }finally{process.chdir(cwd);}
  });

  test("applyCliLocalEnv 不覆盖已有环境变量", () => {
    const root = tempRoot();
    const envDir = path.join(root, ".mcp-probe-kit");
    fs.mkdirSync(envDir, { recursive: true });
    fs.writeFileSync(
      path.join(envDir, "local.env"),
      "MEMORY_QDRANT_URL=http://from-file:50008\nMEMORY_EMBEDDING_URL=http://127.0.0.1:50012/v1\n",
      "utf8",
    );

    const env = {
      MEMORY_QDRANT_URL: "http://from-shell:50008",
    } as NodeJS.ProcessEnv;

    const outcome = applyCliLocalEnv(root, env);

    expect(outcome.loadedFrom).toContain("local.env");
    expect(outcome.appliedKeys).toEqual(["MEMORY_EMBEDDING_URL"]);
    expect(env.MEMORY_QDRANT_URL).toBe("http://from-shell:50008");
    expect(env.MEMORY_EMBEDDING_URL).toBe("http://127.0.0.1:50012/v1");
  });

  test("ensureCliLocalEnvExample 首次创建且不覆盖已有文件", () => {
    const root = tempRoot();

    const first = ensureCliLocalEnvExample(root);
    const second = ensureCliLocalEnvExample(root);

    expect(first.created).toBe(true);
    expect(first.path).toBe(CLI_LOCAL_ENV_EXAMPLE_REL_PATH);
    expect(second.created).toBe(false);
    expect(fs.existsSync(path.join(root, CLI_LOCAL_ENV_EXAMPLE_REL_PATH))).toBe(true);
  });

  test("ensureCliLocalEnvTemplate 首次创建 local.env 且不覆盖已有文件", () => {
    const root = tempRoot();
    const first = ensureCliLocalEnvTemplate(root);
    const second = ensureCliLocalEnvTemplate(root);

    expect(first.created).toBe(true);
    expect(first.path).toBe(CLI_LOCAL_ENV_REL_PATH);
    expect(second.created).toBe(false);
    expect(fs.readFileSync(path.join(root, CLI_LOCAL_ENV_REL_PATH), "utf8")).toBe(CLI_LOCAL_ENV_CONTENT);
  });

  test("bootstrapCliLocalEnv 从 cwd 项目加载 local.env", () => {
    const root = tempRoot();
    const previousCwd = process.cwd();
    const envDir = path.join(root, ".mcp-probe-kit");
    fs.mkdirSync(envDir, { recursive: true });
    fs.writeFileSync(
      path.join(envDir, "local.env"),
      "MEMORY_QDRANT_URL=http://127.0.0.1:50008\n",
      "utf8",
    );

    vi.stubEnv("MEMORY_QDRANT_URL", "");
    vi.stubEnv("MCP_PROJECT_ROOT", undefined);
    process.chdir(root);
    try {
      const outcome = bootstrapCliLocalEnv();
      expect(outcome.loadedFrom?.replace(/\\/g, "/")).toContain(CLI_LOCAL_ENV_REL_PATH);
      expect(outcome.appliedKeys).toContain("MEMORY_QDRANT_URL");
      expect(process.env.MEMORY_QDRANT_URL).toBe("http://127.0.0.1:50008");
    } finally {
      process.chdir(previousCwd);
    }
  });
});
