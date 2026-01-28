#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { 
  initProject, gencommit, debug, genapi,
  codeReview, gentest, genpr, checkDeps, gendoc, genchangelog, refactor, perf,
  gensql, resolveConflict, genreadme, analyzeProject,
  initProjectContext, addFeature, securityScan, fixBug, estimate, genMock,
  startFeature, startBugfix, startReview, startRelease, startRefactor, startOnboard, startApi, startDoc,
  startRalph, interview, askUser,
  uiDesignSystem, initComponentCatalog, uiSearch, syncUiData, renderUi, startUi,
  genPrd, genPrototype, startProduct
} from "./tools/index.js";
import { VERSION, NAME } from "./version.js";
import { allToolSchemas } from "./schemas/index.js";
import { filterTools, getToolsetFromEnv, getToolsetSize } from "./lib/toolset-manager.js";
import { getTasksManager } from "./lib/tasks-manager.js";

// 创建MCP服务器实例
const server = new Server(
  {
    name: NAME,
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// 定义工具列表 - 从 schemas 导入，并根据工具集过滤
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const toolset = getToolsetFromEnv();
  const filteredTools = filterTools(allToolSchemas, toolset);
  
  console.error(`[MCP Probe Kit] 当前工具集: ${toolset} (${filteredTools.length}/${allToolSchemas.length} 个工具)`);
  
  return {
    tools: filteredTools,
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "init_project":
        return await initProject(args as any);
      case "gencommit":
        return await gencommit(args as any);
      case "debug":
        return await debug(args as any);
      case "genapi":
        return await genapi(args as any);
      case "code_review":
        return await codeReview(args as any);
      case "gentest":
        return await gentest(args as any);
      case "genpr":
        return await genpr(args as any);
      case "check_deps":
        return await checkDeps(args as any);
      case "gendoc":
        return await gendoc(args as any);
      case "genchangelog":
        return await genchangelog(args as any);
      case "refactor":
        return await refactor(args as any);
      case "perf":
        return await perf(args as any);
      case "gensql":
        return await gensql(args as any);
      case "resolve_conflict":
        return await resolveConflict(args as any);
      case "genreadme":
        return await genreadme(args as any);
      case "analyze_project":
        return await analyzeProject(args as any);
      case "init_project_context":
        return await initProjectContext(args as any);
      case "add_feature":
        return await addFeature(args as any);
      case "security_scan":
        return await securityScan(args as any);
      case "fix_bug":
        return await fixBug(args as any);
      case "estimate":
        return await estimate(args as any);
      case "gen_mock":
        return await genMock(args as any);
      // 智能编排工具
      case "start_feature":
        return await startFeature(args as any);
      case "start_bugfix":
        return await startBugfix(args as any);
      case "start_review":
        return await startReview(args as any);
      case "start_release":
        return await startRelease(args as any);
      case "start_refactor":
        return await startRefactor(args as any);
      case "start_onboard":
        return await startOnboard(args as any);
      case "start_api":
        return await startApi(args as any);
      case "start_doc":
        return await startDoc(args as any);
      case "start_ralph":
        return await startRalph(args as any);
      // 访谈工具
      case "interview":
        return await interview(args as any);
      case "ask_user":
        return await askUser(args as any);
      // UI/UX Pro Max 工具
      case "ui_design_system":
        return await uiDesignSystem(args as any);
      case "init_component_catalog":
        return await initComponentCatalog(args as any);
      case "ui_search":
        return await uiSearch(args as any);
      case "sync_ui_data":
        return await syncUiData(args as any);
      case "render_ui":
        return await renderUi(args as any);
      case "start_ui":
        return await startUi(args as any);
      // 产品设计工作流
      case "gen_prd":
        return await genPrd(args as any);
      case "gen_prototype":
        return await genPrototype(args as any);
      case "start_product":
        return await startProduct(args as any);
      default:
        throw new Error(`未知工具: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `错误: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// 定义资源列表
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "probe://status",
        name: "服务器状态",
        description: "MCP Probe Kit 服务器当前状态",
        mimeType: "application/json",
      },
    ],
  };
});

// 读取资源
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "probe://status") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              status: "running",
              timestamp: new Date().toISOString(),
              serverInfo: {
                name: NAME,
                version: VERSION,
                description: "AI 驱动的完整研发工具集",
              },
              toolCount: allToolSchemas.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  throw new Error(`未知资源: ${uri}`);
});

// ============================================
// Tasks API 端点 - 暂时禁用，等待 MCP SDK 正式支持
// ============================================
// 注意：当前 MCP SDK 版本不支持自定义 method，Tasks API 功能暂时禁用
// 相关 issue: https://github.com/modelcontextprotocol/sdk/issues/xxx

/*
// 获取任务状态
server.setRequestHandler({ method: "tasks/get" } as any, async (request: any) => {
  try {
    const { taskId } = request.params;
    const tasksManager = getTasksManager();
    const task = tasksManager.getTask(taskId);
    
    return {
      task,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get task: ${errorMessage}`);
  }
});

// 获取任务结果
server.setRequestHandler({ method: "tasks/result" } as any, async (request: any) => {
  try {
    const { taskId } = request.params;
    const tasksManager = getTasksManager();
    const result = tasksManager.getTaskResult(taskId);
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get task result: ${errorMessage}`);
  }
});

// 取消任务
server.setRequestHandler({ method: "tasks/cancel" } as any, async (request: any) => {
  try {
    const { taskId } = request.params;
    const tasksManager = getTasksManager();
    tasksManager.cancelTask(taskId);
    
    return {
      _meta: {},
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to cancel task: ${errorMessage}`);
  }
});

// 列出所有任务
server.setRequestHandler({ method: "tasks/list" } as any, async () => {
  try {
    const tasksManager = getTasksManager();
    const tasks = tasksManager.listTasks();
    
    return {
      tasks,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list tasks: ${errorMessage}`);
  }
});
*/

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Probe Kit 服务器已启动");
}

// 启动服务器
main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
