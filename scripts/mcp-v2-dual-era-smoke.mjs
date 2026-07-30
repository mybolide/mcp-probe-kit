import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import {
  CallToolResultSchema,
  GetTaskResultSchema,
} from "@modelcontextprotocol/core";

const roots = [];

try {
  const legacy = await runLegacySmoke();
  const modern = await runModernSmoke();
  console.log(JSON.stringify({ legacy, modern }, null, 2));
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
    assert(tools.tools.length === 30, "Legacy tools/list count mismatch");

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
      started: stderr().includes("v4-sdk2-dual-era-20260730"),
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
    assert(tools.tools.length === 30, "Modern tools/list count mismatch");

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

    return {
      era: client.getProtocolEra(),
      tools: tools.tools.length,
      inputRequired: statusPayload.protocol.features.inputRequired,
      elicitationCalls: elicitationCalls(),
      modernTasks: statusPayload.protocol.features.modernTasks,
      taskFallbackFirstTool: fallback.structuredContent?.firstTool,
      started: stderr().includes("v4-sdk2-dual-era-20260730"),
    };
  } finally {
    await client.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
  }
}

async function connect(mode, elicitationEnabled) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["build/index.js"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      MCP_PROTOCOL_MODE: "auto",
      MCP_ENABLE_GITNEXUS_BRIDGE: "0",
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
