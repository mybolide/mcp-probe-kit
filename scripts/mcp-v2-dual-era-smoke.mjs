import { mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import {
  CallToolResultSchema,
  GetTaskResultSchema,
} from "@modelcontextprotocol/core";
import {
  COMPACT_WITH_HISTORY_TOOL_COUNT,
  FULL_TOOL_COUNT,
  PACKAGE_VERSION,
} from "./release-surface.mjs";

const roots = [];

try {
  const legacy = await runLegacySmoke();
  const modern = await runModernSmoke();
  const full = await runFullSurfaceSmoke();
  console.log(JSON.stringify({ legacy, modern, full }, null, 2));
} finally {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
}

async function runLegacySmoke() {
  const projectRoot = await createProjectRoot("legacy");
  const { client, transport, stderr } = await connect("legacy", false);

  try {
    assert(client.getProtocolEra() === "legacy", "Legacy era negotiation failed");
    const tools = await client.listTools();
    assert(
      tools.tools.length === COMPACT_WITH_HISTORY_TOOL_COUNT,
      `Legacy compact tools/list returned ${tools.tools.length}`
    );
    assert(
      tools.tools.some((tool) => tool.name === "history_session_bootstrap") &&
        tools.tools.some((tool) => tool.name === "devcontrol"),
      "Legacy compact tools/list missing v5 DevControl / History Session tools"
    );

    const created = CallToolResultSchema.parse(
      await client.request(
        {
          method: "tools/call",
          params: {
            name: "devcontrol",
            arguments: {
              action: "next",
              project_root: projectRoot,
              input: {},
            },
            task: { ttl: 60_000 },
          },
        },
        CallToolResultSchema
      )
    );
    const taskId = created.task?.taskId;
    assert(typeof taskId === "string", "Legacy tools/call did not return taskId");

    const terminal = await waitForTask(client, taskId);
    assert(terminal.status === "completed", `Legacy task ended as ${terminal.status}: ${JSON.stringify(terminal)}`);

    const result = CallToolResultSchema.parse(
      await client.request(
        { method: "tasks/result", params: { taskId } },
        CallToolResultSchema
      )
    );
    assert(
      result.isError !== true && result.structuredContent &&
        !JSON.stringify(result.structuredContent).includes('start_feature'),
      "Legacy v5 DevControl task result mismatch"
    );

    return {
      era: client.getProtocolEra(),
      tools: tools.tools.length,
      taskStatus: terminal.status,
      taskTtl: created.task?.ttl,
      resultType: typeof result.structuredContent,
      started: stderr().includes(`MCP Probe Kit v${PACKAGE_VERSION} 已启动`),
    };
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}

async function runModernSmoke() {
  const projectRoot = await createProjectRoot("modern");
  const { client, transport, stderr, elicitationCalls } = await connect(
    "modern",
    true
  );

  try {
    assert(client.getProtocolEra() === "modern", "Modern era negotiation failed");
    const tools = await client.listTools();
    assert(
      tools.tools.length === COMPACT_WITH_HISTORY_TOOL_COUNT,
      `Modern compact tools/list returned ${tools.tools.length}`
    );
    for (const toolName of ["devcontrol", "history_session_bootstrap", "history_session_checkpoint"]) {
      assert(
        tools.tools.some((tool) => tool.name === toolName),
        `Modern tools/list missing ${toolName}`
      );
    }

    const status = await client.readResource({ uri: "probe://status" });
    const statusContent = status.contents[0];
    assert(statusContent && "text" in statusContent, "Status resource is not text");
    const statusPayload = JSON.parse(statusContent.text);
    assert(
      statusPayload.protocol.features.inputRequired === true,
      "Modern client capability discovery should retain elicitation support"
    );
    assert(
      statusPayload.protocol.features.modernTasks === false,
      "Modern Tasks must remain disabled until the extension adapter is wired"
    );

    const loopResult = await client.callTool({
      name: "devcontrol",
      arguments: {
        action: "feature-create",
        project_root: projectRoot,
        input: {name:"user-auth",description:"User authentication with explicit credential validation"},
      },
    });
    assert(elicitationCalls() === 0, "v5 unexpectedly invoked delegated-plan elicitation");
    assert(loopResult.isError !== true, `Modern v5 create failed: ${JSON.stringify(loopResult.structuredContent)}`);
    assert(
      loopResult.structuredContent?.status === "draft" && loopResult.structuredContent?.revision === 1,
      "Modern v5 feature creation did not produce a SQLite draft"
    );
    const stored=await client.callTool({name:'devcontrol',arguments:{
      action:'feature-get',project_root:projectRoot,input:{name:'user-auth'}}});
    assert(stored.structuredContent?.revision===1&&stored.structuredContent?.name==='user-auth',
      'Modern v5 feature-get did not find the same SQLite revision');

    const fallback = CallToolResultSchema.parse(
      await client.request(
        {
          method: "tools/call",
          params: {
            name: "devcontrol",
            arguments: {
              action: "next",
              project_root: projectRoot,
              input: {},
            },
            task: { ttl: 60_000 },
          },
        },
        CallToolResultSchema
      )
    );
    assert(!fallback.task, "Modern task fallback returned a Legacy task handle");
    assert(
      fallback.isError !== true && fallback.structuredContent &&
        !JSON.stringify(fallback.structuredContent).includes('start_feature'),
      "Modern v5 task sync fallback result mismatch"
    );

    return {
      era: client.getProtocolEra(),
      tools: tools.tools.length,
      inputRequired: statusPayload.protocol.features.inputRequired,
      elicitationCalls: elicitationCalls(),
      modernTasks: statusPayload.protocol.features.modernTasks,
      featureRevision: stored.structuredContent?.revision,
      taskFallbackSynchronous: !fallback.task,
      started: stderr().includes(`MCP Probe Kit v${PACKAGE_VERSION} 已启动`),
    };
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}

async function runFullSurfaceSmoke() {
  const { client, transport } = await connect("modern", false, "full");
  try {
    const tools = await client.listTools();
    assert(
      tools.tools.length === FULL_TOOL_COUNT,
      `Full tools/list returned ${tools.tools.length}`
    );
    for (const toolName of ["devcontrol", "ui_design_system", "git_work_report", "history_session_bootstrap"]) {
      assert(
        tools.tools.some((tool) => tool.name === toolName),
        `Full v5 tools/list missing active tool ${toolName}`
      );
    }
    for(const retired of ['workflow','start_feature','resume_plan','converge','add_feature']){
      assert(!tools.tools.some(tool=>tool.name===retired),
        `Full v5 tools/list exposed retired delegated-plan tool ${retired}`);
    }
    return { tools: tools.tools.length, sqliteOnlySurface: true };
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}

async function connect(mode, elicitationEnabled, toolset = "compact") {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["build/index.js"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      MCP_PROTOCOL_MODE: "auto",
      MCP_ENABLE_GITNEXUS_BRIDGE: "0",
      MCP_TOOLSET: toolset,
      MCP_HISTORY_SESSION: "1",
      MCP_DEVCONTROL_AUTOSTART: "0",
      MEMORY_QDRANT_URL: "",
      MEMORY_EMBEDDING_URL: "",
      MEMORY_EMBEDDING_MODEL: "",
    },
    stderr: "pipe",
  });
  let stderrText = "";
  transport.stderr?.on("data", (chunk) => {
    stderrText += chunk.toString();
  });

  const client = new Client(
    { name: `production-${mode}-smoke`, version: "1.0.0" },
    { capabilities: elicitationEnabled ? { elicitation: {} } : {} }
  );
  client.setVersionNegotiation({
    mode: mode === "modern" ? { pin: "2026-07-28" } : "legacy",
  });

  let calls = 0;
  if (elicitationEnabled) {
    client.setRequestHandler("elicitation/create", async (request) => {
      calls += 1;
      assert("requestedSchema" in request.params, "Expected form elicitation");
      const propertyNames = Object.keys(request.params.requestedSchema.properties ?? {});
      return {
        action: "accept",
        content: Object.fromEntries(
          propertyNames.map((key, index) => [key, `生产冒烟回答 ${index + 1}`])
        ),
      };
    });
  }

  await client.connect(transport);
  return {
    client,
    transport,
    stderr: () => stderrText,
    elicitationCalls: () => calls,
  };
}

async function waitForTask(client, taskId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const task = GetTaskResultSchema.parse(
      await client.request(
        { method: "tasks/get", params: { taskId } },
        GetTaskResultSchema
      )
    );
    if (["completed", "failed", "cancelled"].includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Task did not complete: ${taskId}`);
}

async function createProjectRoot(label) {
  const root = await mkdtemp(join(tmpdir(), `mcp-v2-${label}-`));
  roots.push(root);
  execFileSync('git',['init','-q',root],{timeout:3000,windowsHide:true});
  return root;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
