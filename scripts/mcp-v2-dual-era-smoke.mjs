import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import {
  CallToolResultSchema,
  GetTaskResultSchema,
} from "@modelcontextprotocol/core";
import {
  COMPACT_TOOL_COUNT,
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

async function runPlanLifecycleSmoke(client, projectRoot) {
  const planId = "feature-production-smoke-abc123";
  const plan = {
    planId,
    mode: "delegated",
    contractVersion: "2.0.0",
    workflow: "feature",
    workflowVersion: "4.0.0",
    objective: "验证生产版 Plan 状态闭环",
    steps: [{ id: "verify", action: "verify" }],
    globalRules: [],
    completionCriteria: ["步骤与证据一致"],
    memoryPolicy: {
      recallBeforeExecution: true,
      extractAfterValidation: true,
      writeOnlyReusableKnowledge: true,
      allowNegativeMemory: true,
    },
  };
  const heartbeat = await client.callTool({
    name: "plan_heartbeat",
    arguments: {
      plan_id: planId,
      project_root: projectRoot,
      plan,
      completed_step_ids: ["verify"],
      evidence: [
        { kind: "requirements", summary: "范围已确认" },
        { kind: "spec", summary: "规格已确认", reference: "smoke-spec" },
        { kind: "implementation", summary: "实现完成", revision: "abc123" },
        { kind: "test", summary: "测试通过", reference: "smoke-test" },
        { kind: "review", summary: "审查通过", reference: "smoke-review" },
      ],
    },
  });
  assert(heartbeat.structuredContent?.stored === true, "Plan heartbeat was not stored");

  const resumed = await client.callTool({
    name: "resume_plan",
    arguments: { plan_id: planId, project_root: projectRoot },
  });
  assert(resumed.structuredContent?.found === true, "Plan resume did not find checkpoint");

  const converged = await client.callTool({
    name: "converge",
    arguments: { plan_id: planId, project_root: projectRoot },
  });
  assert(converged.structuredContent?.passed === true, "Plan did not converge");
  return {
    stored: heartbeat.structuredContent?.stored,
    readySteps: resumed.structuredContent?.readyStepIds?.length,
    converged: converged.structuredContent?.passed,
    memoryWriteAllowed: converged.structuredContent?.memoryWriteAllowed,
  };
}

async function runLegacySmoke() {
  const projectRoot = await createProjectRoot("legacy");
  const { client, transport, stderr } = await connect("legacy", false);

  try {
    assert(client.getProtocolEra() === "legacy", "Legacy era negotiation failed");
    const tools = await client.listTools();
    assert(
      tools.tools.length === COMPACT_TOOL_COUNT,
      `Legacy compact tools/list returned ${tools.tools.length}`
    );

    const created = CallToolResultSchema.parse(
      await client.request(
        {
          method: "tools/call",
          params: {
            name: "workflow",
            arguments: {
              intent: "实现订单导出功能",
              scenario: "feature",
              project_root: projectRoot,
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
    assert(terminal.status === "completed", `Legacy task ended as ${terminal.status}`);

    const result = CallToolResultSchema.parse(
      await client.request(
        { method: "tasks/result", params: { taskId } },
        CallToolResultSchema
      )
    );
    assert(
      result.structuredContent?.firstTool === "start_feature",
      "Legacy task result mismatch"
    );

    return {
      era: client.getProtocolEra(),
      tools: tools.tools.length,
      taskStatus: terminal.status,
      taskTtl: created.task?.ttl,
      firstTool: result.structuredContent?.firstTool,
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
      tools.tools.length === COMPACT_TOOL_COUNT,
      `Modern compact tools/list returned ${tools.tools.length}`
    );
    for (const toolName of ["plan_heartbeat", "resume_plan", "converge"]) {
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
      "Modern input_required capability was not reported"
    );
    assert(
      statusPayload.protocol.features.modernTasks === false,
      "Modern Tasks must remain disabled until the extension adapter is wired"
    );

    const loopResult = await client.callTool({
      name: "start_feature",
      arguments: {
        feature_name: "user-auth",
        description: "用户认证功能",
        requirements_mode: "loop",
        loop_question_budget: 2,
        project_root: projectRoot,
      },
    });
    assert(elicitationCalls() === 1, "Modern input_required round did not run once");
    assert(loopResult.isError !== true, "Modern input_required result is an error");
    assert(
      loopResult.structuredContent?.metadata?.plan?.workflow === "feature",
      "Modern requirements loop did not converge to a feature plan"
    );

    const fallback = CallToolResultSchema.parse(
      await client.request(
        {
          method: "tools/call",
          params: {
            name: "workflow",
            arguments: {
              intent: "实现订单导出功能",
              scenario: "feature",
              project_root: projectRoot,
            },
            task: { ttl: 60_000 },
          },
        },
        CallToolResultSchema
      )
    );
    assert(!fallback.task, "Modern task fallback returned a Legacy task handle");
    assert(
      fallback.structuredContent?.firstTool === "start_feature",
      "Modern task sync fallback result mismatch"
    );

    const planState = await runPlanLifecycleSmoke(client, projectRoot);

    return {
      era: client.getProtocolEra(),
      tools: tools.tools.length,
      inputRequired: statusPayload.protocol.features.inputRequired,
      elicitationCalls: elicitationCalls(),
      modernTasks: statusPayload.protocol.features.modernTasks,
      taskFallbackFirstTool: fallback.structuredContent?.firstTool,
      planState,
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
    for (const toolName of ["add_feature", "fix_bug", "sync_ui_data", "ask_user"]) {
      assert(
        tools.tools.some((tool) => tool.name === toolName),
        `Full tools/list missing compatibility tool ${toolName}`
      );
    }
    return { tools: tools.tools.length, compatibilitySurface: true };
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
  return root;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
