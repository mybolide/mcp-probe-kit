import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseArgs, getString, getBoolean } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { renderOrchestrationHeader } from '../lib/orchestration-guidance.js';
import { renderDelegatedPlanSteps } from '../lib/delegated-plan-renderer.js';
import {
  buildSkillBridgePlanStep,
  buildSkillHeaderNote,
  detectSkillBridge,
  renderSkillBridgeSection,
} from '../lib/skill-bridge.js';
import {
  buildDelegatedPlanContract,
  createDelegatedPlanId,
  type DelegatedPlanStep,
} from '../lib/delegated-plan-contract.js';
import { resolveWorkspaceRoot, isLikelyProjectNamedRelativePath, buildProjectRootRetryHint } from '../lib/workspace-root.js';
import { WorkflowReportSchema } from '../schemas/structured-output.js';
import type { Artifact, WorkflowReport, WorkflowStep } from '../schemas/structured-output.js';
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from '../lib/tool-execution-context.js';

/** Product workflow entry. It exposes one closed delegated plan, not phantom sub-tools. */
export async function startProduct(args: unknown, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, 'start_product 已取消');
    await reportToolProgress(context, 10, 'start_product: 解析产品输入');

    const parsed = parseArgs<{
      description?: string;
      requirements_file?: string;
      product_name?: string;
      product_type?: string;
      skip_design_system?: boolean;
      docs_dir?: string;
      project_root?: string;
    }>(args, {
      defaultValues: {
        description: '',
        requirements_file: '',
        product_name: '新产品',
        product_type: 'SaaS',
        skip_design_system: false,
        docs_dir: 'docs',
        project_root: '',
      },
      primaryField: 'description',
      fieldAliases: {
        description: ['desc', '需求', '描述'],
        requirements_file: ['req_file', '需求文件'],
        product_name: ['name', '产品名称'],
        product_type: ['type', '产品类型'],
        skip_design_system: ['skip_design'],
        docs_dir: ['dir', '目录'],
        project_root: ['projectRoot', 'project_path', 'projectPath', 'root', '项目路径', '项目根目录'],
      },
    });

    const explicitProjectRoot = getString(parsed.project_root);
    if (isLikelyProjectNamedRelativePath(explicitProjectRoot)) {
      return {
        content: [{
          type: 'text',
          text: `拒绝执行产品编排：project_root 可能是带项目名的半相对路径（${explicitProjectRoot}）。请改为目标项目根目录绝对路径。`,
        }],
        isError: true,
        structuredContent: {
          error_code: 'INVALID_PROJECT_ROOT',
          rejected_project_root: explicitProjectRoot,
          retry_hint: buildProjectRootRetryHint(explicitProjectRoot),
        },
      };
    }

    const projectRoot = resolveWorkspaceRoot(explicitProjectRoot);
    const requirementsFile = getString(parsed.requirements_file);
    const productName = getString(parsed.product_name) || '新产品';
    const productType = getString(parsed.product_type) || 'SaaS';
    const skipDesignSystem = getBoolean(parsed.skip_design_system);
    const docsDir = getString(parsed.docs_dir) || 'docs';
    let description = getString(parsed.description);
    let requirementsSource = '用户提供的描述';

    if (requirementsFile) {
      const resolvedFile = path.isAbsolute(requirementsFile)
        ? requirementsFile
        : path.join(projectRoot, requirementsFile);
      description = await fs.readFile(resolvedFile, 'utf8');
      requirementsSource = `需求文件：${resolvedFile}`;
    }
    if (!description.trim()) {
      return {
        content: [{ type: 'text', text: '缺少产品描述：请提供 description 或 requirements_file。' }],
        isError: true,
        structuredContent: { error_code: 'MISSING_PRODUCT_DESCRIPTION' },
      };
    }

    throwIfAborted(context?.signal, 'start_product 已取消');
    await reportToolProgress(context, 45, 'start_product: 构建闭环计划');

    const skillBridge = detectSkillBridge('start_product');
    const includeDesignSystem = !skipDesignSystem;
    const steps: DelegatedPlanStep[] = [
      buildSkillBridgePlanStep(skillBridge),
      {
        id: 'context',
        type: 'tool',
        tool: 'init_project_context',
        when: `缺少 AGENTS.md 或 ${docsDir}/project-context.md`,
        args: { docs_dir: docsDir, project_root: projectRoot },
        outputs: ['AGENTS.md', `${docsDir}/project-context.md`],
      },
      {
        id: 'prd',
        type: 'agent_action',
        action: 'generate_product_requirements_document',
        requiredInputs: [requirementsSource, '产品目标、用户、问题、范围、约束、页面与验收标准'],
        expectedOutputs: [`${docsDir}/prd/product-requirements.md`],
        outputs: [`${docsDir}/prd/product-requirements.md`],
        note: '由 Agent 使用宿主文件能力生成 PRD；该步骤不是 MCP 工具调用',
      },
      {
        id: 'prototype-docs',
        type: 'agent_action',
        action: 'generate_prototype_documents',
        dependsOn: ['prd'],
        requiredInputs: [`${docsDir}/prd/product-requirements.md`],
        expectedOutputs: [
          `${docsDir}/prototype/prototype-index.md`,
          `${docsDir}/prototype/page-*.md`,
        ],
        outputs: [
          `${docsDir}/prototype/prototype-index.md`,
          `${docsDir}/prototype/page-*.md`,
        ],
        note: '由 Agent 从 PRD 的页面与流程定义生成原型文档；该步骤不是 MCP 工具调用',
      },
      ...(includeDesignSystem
        ? [{
            id: 'design-system',
            type: 'tool' as const,
            tool: 'ui_design_system',
            dependsOn: ['prd'],
            args: { product_type: productType, description: productName, stack: 'html' },
            outputs: [`${docsDir}/design-system.json`, `${docsDir}/design-system.md`],
          }]
        : []),
      {
        id: 'html-prototype',
        type: 'tool',
        tool: 'start_ui',
        dependsOn: includeDesignSystem ? ['prototype-docs', 'design-system'] : ['prototype-docs'],
        args: {
          description: `根据 ${docsDir}/prototype/ 下的页面原型文档，为 ${productName} 生成可交互 HTML 原型；输出到 ${docsDir}/html-prototype/，并遵守现有设计系统`,
          framework: 'html',
          project_root: projectRoot,
          mode: 'manual',
        },
        outputs: [`${docsDir}/html-prototype/index.html`, `${docsDir}/html-prototype/page-*.html`],
      },
      {
        id: 'update-context',
        type: 'agent_action',
        action: 'update_project_context',
        dependsOn: ['html-prototype'],
        requiredInputs: [
          `${docsDir}/prd/product-requirements.md`,
          `${docsDir}/prototype/prototype-index.md`,
          `${docsDir}/html-prototype/index.html`,
        ],
        expectedOutputs: [`${docsDir}/project-context.md 中已加入产品设计与原型索引`],
        outputs: [`${docsDir}/project-context.md`],
      },
    ];

    const plan = buildDelegatedPlanContract({
      planId: createDelegatedPlanId('product', `${productName}:${description}`),
      workflow: 'product',
      workflowVersion: '4.0.0-rc.2',
      objective: `完成 ${productName} 的 PRD、原型文档、设计系统与 HTML 原型`,
      steps,
      globalRules: [
        '文本指导与 structuredContent.metadata.plan.steps 必须保持一致',
        '不得把 Agent 操作伪装成 MCP 工具调用',
        '所有文档和原型必须由 Agent 使用宿主文件能力真实落盘',
      ],
      completionCriteria: [
        'PRD 已落盘且覆盖目标用户、范围、页面、流程与验收标准',
        '原型文档与 HTML 原型页面一致',
        '项目上下文索引已更新',
      ],
      memoryPolicy: { recallBeforeExecution: false, extractAfterValidation: false },
    });

    const header = renderOrchestrationHeader({
      tool: 'start_product',
      goal: `产品设计：${productName}`,
      tasks: ['按 delegated plan 生成 PRD、原型文档、设计系统与 HTML 原型'],
      notes: [buildSkillHeaderNote(skillBridge), requirementsSource],
    });
    const guidance = `${header}${renderSkillBridgeSection(skillBridge)}
# 产品设计闭环

- 产品：${productName}
- 类型：${productType}
- 文档目录：${docsDir}
- 规则：以下文字直接由 \`structuredContent.metadata.plan.steps\` 渲染。

## 执行计划
${renderDelegatedPlanSteps(plan.steps)}`;

    const pending: WorkflowStep['status'] = 'pending';
    const reportSteps: WorkflowStep[] = plan.steps.map((step) => ({
      name: step.id,
      status: pending,
      description: step.tool
        ? `调用 ${step.tool}`
        : `Agent 操作：${step.action ?? step.id}`,
    }));
    const artifacts: Artifact[] = [
      { path: `${docsDir}/prd/product-requirements.md`, type: 'doc', purpose: '产品需求文档' },
      { path: `${docsDir}/prototype/prototype-index.md`, type: 'doc', purpose: '原型索引' },
      { path: `${docsDir}/prototype/page-*.md`, type: 'doc', purpose: '页面原型文档' },
      { path: `${docsDir}/html-prototype/index.html`, type: 'doc', purpose: 'HTML 原型入口' },
      ...(includeDesignSystem
        ? [
            { path: `${docsDir}/design-system.json`, type: 'doc' as const, purpose: '设计系统配置' },
            { path: `${docsDir}/design-system.md`, type: 'doc' as const, purpose: '设计系统文档' },
          ]
        : []),
    ];
    const report: WorkflowReport = {
      summary: `产品设计工作流：${productName}`,
      status: 'pending',
      steps: reportSteps,
      artifacts,
      nextSteps: plan.steps.map((step) =>
        step.tool ? `调用 ${step.tool}` : `执行 Agent 操作 ${step.action ?? step.id}`
      ),
      metadata: { plan, skills: skillBridge, projectRoot, requirementsSource },
    };

    await reportToolProgress(context, 95, 'start_product: 闭环计划已生成');
    return okStructured(guidance, report, {
      schema: WorkflowReportSchema,
      note: 'Agent 应严格执行 metadata.plan；所有工具引用均必须存在于当前工具面',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `产品工作流生成失败：${message}` }],
      isError: true,
      structuredContent: { error_code: 'START_PRODUCT_FAILED', message },
    };
  }
}
