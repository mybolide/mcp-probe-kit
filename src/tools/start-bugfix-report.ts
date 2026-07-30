import type { BugFixReport } from '../schemas/structured-output.js';

interface GraphDocs {
  latestMarkdownPath: string;
  latestJsonPath: string;
}

interface SpecGateLike {
  specDir: string;
}

export interface BuildBugfixReportInput {
  errorMessage: string;
  stackTrace: string;
  analysisMode: 'src8' | 'tbp8';
  indexPath: string;
  graphDocs: GraphDocs;
  graphDocsMissing: boolean;
  graphCodeContext: string;
  bootstrapState: Record<string, unknown>;
  graphContext: unknown;
  specGate?: SpecGateLike;
  memoryEnabled: boolean;
  plan: unknown;
  templateMeta: Record<string, string>;
}

export function buildBugfixReport(input: BuildBugfixReportInput): BugFixReport {
  const {
    errorMessage,
    stackTrace,
    analysisMode,
    indexPath,
    graphDocs,
    graphDocsMissing,
    graphCodeContext,
    bootstrapState,
    graphContext,
    specGate,
    memoryEnabled,
    plan,
    templateMeta,
  } = input;

  return {
    summary: `Bug 修复工作流：${errorMessage.substring(0, 50)}${errorMessage.length > 50 ? '...' : ''}`,
    status: 'pending',
    analysisMode,
    steps: [
      {
        name: '检查项目上下文',
        status: 'pending',
        description: `检查 ${indexPath} 与 graph-insights/latest.* 是否存在，缺失则调用 init_project_context`,
      },
      {
        name: 'SRC-8 真因分析与修复',
        status: 'pending',
        description: '按 metadata.plan 执行 src8-1~8（src8-4 闭合前禁止改代码）',
      },
      ...(specGate
        ? [{
            name: '规格闸门校验',
            status: 'pending' as const,
            description: `修复后调用 check_spec 校验 ${specGate.specDir}/`,
          }]
        : []),
    ],
    artifacts: [],
    nextSteps: [
      '检查并读取项目上下文文档',
      `如果缺少 ${graphDocs.latestMarkdownPath} / ${graphDocs.latestJsonPath}，先调用 init_project_context 补齐图谱初始化`,
      `优先读取 ${graphDocs.latestMarkdownPath} 获取调用链、依赖和影响面摘要`,
      '严格按 metadata.plan 执行 src8-1~8，禁止从 src8-4 跳起',
      'src8-4 完成 rootCauseWorksheet 与 rootCauseAnalysis 后再改代码',
      'src8-7 gentest 生成回归测试并验证',
      ...(specGate
        ? [`修复后调用 check_spec 校验 ${specGate.specDir}/，未通过先补规格再重跑`]
        : []),
      ...(memoryEnabled
        ? ['src8-8 准备 MemoryCandidate 并写入 plan_heartbeat；converge 通过后再调用 memorize_asset']
        : []),
    ],
    rootCause: '待分析（src8-4 rootCauseAnalysis）',
    fixPlan: '待制定（src8-5）',
    testPlan: '待定义（src8-3 验收契约 + src8-7 gentest）',
    affectedFiles: [],
    tbp: {
      phenomenon: `待确认：${errorMessage}`,
      timeline: [
        { order: 1, event: '收到用户错误描述', evidence: errorMessage },
        ...(stackTrace
          ? [{ order: 2, event: '收到堆栈信息', evidence: stackTrace }]
          : []),
      ],
      ruledOut: [],
      commonPattern: '待通过成功/失败样本对比确认分叉点',
      boundary: '待定位（优先检查状态机、工具执行层、文件系统、环境配置）',
      rootCauseStatement: '待形成 “A + B 在条件 D 下导致 C” 的因果句',
      evidence: [
        { type: 'symptom', detail: errorMessage, source: 'error_message' },
        ...(stackTrace
          ? [{ type: 'stack' as const, detail: stackTrace, source: 'stack_trace' }]
          : []),
        ...(graphCodeContext
          ? [{ type: 'graph' as const, detail: graphCodeContext, source: 'graph_context' }]
          : []),
      ],
      repair: [
        {
          layer: 'analysis',
          action: '先按 metadata.plan 完成 src8-1~4 真因工作表闭合，再进入修复',
          risk: '若直接改代码，容易补症状而非修真因',
          verification: '检查真因是否能解释全部关键现象并排除竞争假设',
        },
      ],
    },
    metadata: {
      plan,
      template: templateMeta,
      analysisMode,
      graphDocs,
      bootstrapState: {
        ...bootstrapState,
        graphDocsMissing,
      },
      graphContext,
      ...(specGate ? { specGate } : {}),
    },
  };
}
