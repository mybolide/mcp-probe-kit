import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseArgs, getString, getBoolean } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { attachHandles } from '../lib/handles.js';
import { renderOrchestrationHeader } from '../lib/orchestration-guidance.js';
import {
  renderDelegatedPlanStateProtocol,
  renderDelegatedPlanSteps,
} from '../lib/delegated-plan-renderer.js';
import {
  buildSkillBridgePlanStep,
  buildSkillHeaderNote,
  detectSkillBridge,
  renderSkillBridgeSection,
} from '../lib/skill-bridge.js';
import { WorkflowReportSchema } from '../schemas/structured-output.js';
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from '../lib/tool-execution-context.js';
import {
  buildProjectRootRetryHint,
  isLikelyProjectNamedRelativePath,
  resolveWorkspaceRoot,
} from '../lib/workspace-root.js';
import {
  buildOrchestrationHandles,
  loadMemoryInjectionContext,
  renderMemoryGuideSection,
} from '../lib/memory-orchestration.js';
import type { DelegatedPlanStep } from '../lib/delegated-plan-contract.js';
import { buildProductPlan, buildProductReport } from './start-product-plan.js';

interface ProductBrief {
  targetUsers: string;
  constraints: string;
}

function cleanProductSectionLine(value: string): string {
  return value.trim().replace(/^[-*•]\s*/, '').trim();
}

function extractProductBrief(description: string): ProductBrief {
  const values: Record<keyof ProductBrief, string[]> = {
    targetUsers: [],
    constraints: [],
  };
  let active: keyof ProductBrief | null = null;
  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^([^:：]{1,24})[:：]\s*(.*)$/);
    if (heading) {
      const label = heading[1]?.trim().toLowerCase() ?? '';
      const inlineValue = cleanProductSectionLine(heading[2] ?? '');
      if (/^(目标用户|用户对象|适用用户|target users?|audience)$/.test(label)) {
        active = 'targetUsers';
      } else if (/^(核心约束|约束|限制条件|constraints?)$/.test(label)) {
        active = 'constraints';
      } else {
        active = null;
      }
      if (active && inlineValue) values[active].push(inlineValue);
      continue;
    }
    if (active) {
      const value = cleanProductSectionLine(line);
      if (value) values[active].push(value);
    }
  }
  return {
    targetUsers: values.targetUsers.join('；'),
    constraints: values.constraints.join('；'),
  };
}

function normalizeDocsDir(value: string): string {
  const normalized = (value || 'docs').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error('docs_dir 必须是项目根目录下的相对路径');
  }
  if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('docs_dir 不能包含空路径、. 或 ..');
  }
  return normalized;
}

function resolveProjectFile(projectRoot: string, value: string): string {
  const resolved = path.resolve(projectRoot, value);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('requirements_file 必须位于 project_root 内');
  }
  return resolved;
}

export async function startProduct(args: unknown, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, 'start_product 已取消');
    await reportToolProgress(context, 10, 'start_product: 解析产品输入');

    const parsed = parseArgs<{
      description?: string;
      requirements_file?: string;
      product_name?: string;
      product_type?: string;
      target_users?: string;
      constraints?: string;
      skip_design_system?: boolean;
      docs_dir?: string;
      project_root?: string;
    }>(args, {
      defaultValues: {
        description: '',
        requirements_file: '',
        product_name: '新产品',
        product_type: 'SaaS',
        target_users: '',
        constraints: '',
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
        target_users: ['targetUsers', 'target_user', 'audience', '目标用户', '用户对象'],
        constraints: ['core_constraints', 'limitations', '核心约束', '约束', '限制条件'],
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

    const projectRootNative = resolveWorkspaceRoot(explicitProjectRoot);
    const projectRoot = projectRootNative.replace(/\\/g, '/');
    const docsDir = normalizeDocsDir(getString(parsed.docs_dir) || 'docs');
    const productName = getString(parsed.product_name) || '新产品';
    const productType = getString(parsed.product_type) || 'SaaS';
    const includeDesignSystem = !getBoolean(parsed.skip_design_system);
    const requirementsFile = getString(parsed.requirements_file);
    let description = getString(parsed.description);
    let requirementsSource = '用户提供的描述';
    if (requirementsFile) {
      const resolvedFile = resolveProjectFile(projectRootNative, requirementsFile);
      description = await fs.readFile(resolvedFile, 'utf8');
      requirementsSource = `需求文件：${resolvedFile.replace(/\\/g, '/')}`;
    }
    if (!description.trim()) {
      return {
        content: [{ type: 'text', text: '缺少产品描述：请提供 description 或 requirements_file。' }],
        isError: true,
        structuredContent: { error_code: 'MISSING_PRODUCT_DESCRIPTION' },
      };
    }

    const inferredBrief = extractProductBrief(description);
    const targetUsers = getString(parsed.target_users) || inferredBrief.targetUsers;
    const constraints = getString(parsed.constraints) || inferredBrief.constraints;
    const skillBridge = detectSkillBridge('start_product');
    const skillBridgeStep = buildSkillBridgePlanStep(skillBridge) as DelegatedPlanStep;
    const memoryContext = await loadMemoryInjectionContext(
      `产品设计 PRD 原型 用户流程 验收 失败经验 ${productName} ${productType}`,
      'default',
    );
    const memoryRecallSteps: DelegatedPlanStep[] = memoryContext.enabled
      ? [{
          id: 'recall-memory',
          type: 'tool',
          tool: 'search_memory',
          args: {
            query: `产品设计 PRD 原型 用户流程 验收 失败经验 ${productName} ${productType}`,
            limit: 5,
          },
          expectedOutputs: ['相关产品模式、历史决策、失败方案和验收经验'],
          completionEvidence: ['记录采用、拒绝和需要用当前需求复核的记忆'],
          outputs: [],
          note: '历史产品经验只是候选，不得覆盖当前用户目标和约束',
        }]
      : [];

    throwIfAborted(context?.signal, 'start_product 已取消');
    await reportToolProgress(context, 55, 'start_product: 构建产品交付计划');
    const plan = buildProductPlan({
      projectRoot,
      docsDir,
      productName,
      productType,
      description,
      requirementsSource,
      targetUsers,
      constraints,
      includeDesignSystem,
      memoryEnabled: memoryContext.enabled,
      memoryRecallSteps,
      skillBridgeStep,
    });
    const header = renderOrchestrationHeader({
      tool: 'start_product',
      goal: `产品设计与原型验收：${productName}`,
      tasks: ['按 delegated plan 完成产品 Brief、PRD、原型、设计系统、子 UI 计划和产品包验收'],
      notes: [buildSkillHeaderNote(skillBridge), requirementsSource],
    });
    const guidance = `${header}${renderMemoryGuideSection(memoryContext)}${renderSkillBridgeSection(skillBridge)}
# 产品设计交付

- 产品：${productName}
- 类型：${productType}
${targetUsers ? `- 目标用户：${targetUsers}\n` : ''}${constraints ? `- 核心约束：${constraints}\n` : ''}- 文档目录：${docsDir}
- 边界：本流程交付产品定义和可交互原型，不声称生产代码已经实现。

${renderDelegatedPlanStateProtocol({ planId: plan.planId, projectRoot })}

## 执行计划

${renderDelegatedPlanSteps(plan.steps)}`;
    const report = buildProductReport({
      plan,
      projectRoot,
      docsDir,
      productName,
      includeDesignSystem,
      requirementsSource,
      targetUsers,
      constraints,
      skills: skillBridge,
    });

    await reportToolProgress(context, 95, 'start_product: 产品交付计划已生成');
    return okStructured(
      guidance,
      attachHandles(report, buildOrchestrationHandles(memoryContext)),
      {
        schema: WorkflowReportSchema,
        note: 'Agent 应执行父 Plan，并将 start_ui 返回的子 Plan 独立执行和收敛后再完成父原型步骤。',
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `产品工作流生成失败：${message}` }],
      isError: true,
      structuredContent: { error_code: 'START_PRODUCT_FAILED', message },
    };
  }
}
