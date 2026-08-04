import { buildProjectRootRetryHint, isLikelyProjectNamedRelativePath, resolveWorkspaceRoot } from '../lib/workspace-root.js';
import { buildVisualDirectionContract, type VisualDirectionContract } from '../utils/visual-direction-engine.js';
import { getNumber, getString, parseArgs } from '../utils/parseArgs.js';
import {
  detectUiFramework,
  inferProductType,
  normalizeTemplateName,
  resolveTemplateProfile,
} from './start-ui-config.js';

export interface StartUiRequest {
  description: string;
  framework: string;
  mode: 'auto' | 'manual';
  requirementsMode: string;
  maxRounds: number;
  questionBudget: number;
  assumptionCap: number;
  reviewMaxRounds: number;
  projectRoot: string;
  projectRootPosix: string;
  visualContract: VisualDirectionContract;
  designSystemArgs: Record<string, unknown>;
  templateName: string;
  templateMeta: Record<string, string>;
  headerNotes: string[];
}

export type StartUiRequestResult =
  | { ok: true; value: StartUiRequest }
  | { ok: false; response: Record<string, unknown> };

interface RawUiArgs {
  description?: string;
  framework?: string;
  template?: string;
  project_root?: string;
  target_audience?: string;
  screen_type?: string;
  visual_direction?: string;
  density?: string;
  brand_personality?: string;
  references?: string;
  avoid?: string;
  target_score?: number;
  review_max_rounds?: number;
  mode?: string;
  template_profile?: string;
  requirements_mode?: string;
  loop_max_rounds?: number;
  loop_question_budget?: number;
  loop_assumption_cap?: number;
}

function parseRawArgs(args: unknown): RawUiArgs {
  return parseArgs<RawUiArgs>(args, {
    defaultValues: {
      description: '',
      framework: 'html',
      template: '',
      target_audience: '',
      screen_type: '',
      visual_direction: '',
      density: '',
      brand_personality: '',
      references: '',
      avoid: '',
      target_score: 8.5,
      review_max_rounds: 3,
      mode: 'manual',
      template_profile: 'auto',
      requirements_mode: 'steady',
      loop_max_rounds: 2,
      loop_question_budget: 5,
      loop_assumption_cap: 3,
    },
    primaryField: 'description',
    fieldAliases: {
      description: ['desc', 'ui', 'page', '需求', '描述'],
      framework: ['stack', 'lib', '框架'],
      template: ['name', '模板名'],
      project_root: ['projectRoot', 'project_path', 'projectPath', 'root', 'project_root', 'path', 'dir', 'directory', '项目路径', '项目根目录'],
      target_audience: ['audience', 'users', '目标用户', '用户'],
      screen_type: ['screen', 'page_type', '页面类型'],
      visual_direction: ['direction', 'style_direction', '视觉方向'],
      density: ['content_density', '内容密度', '密度'],
      brand_personality: ['personality', 'brand', '品牌气质'],
      references: ['reference', 'refs', '参考'],
      avoid: ['banned', 'avoid_list', '禁用项', '避免'],
      target_score: ['score', 'quality_score', '目标评分'],
      review_max_rounds: ['review_rounds', 'max_review_rounds', '视觉迭代轮次'],
      mode: ['模式'],
      template_profile: ['profile', 'template_profile', '模板档位', '模板模式'],
      requirements_mode: ['requirements_mode', 'loop', '需求模式'],
      loop_max_rounds: ['max_rounds', 'rounds', '最大轮次'],
      loop_question_budget: ['question_budget', '问题数量', '问题预算'],
      loop_assumption_cap: ['assumption_cap', '假设上限'],
    },
  });
}

function invalidProjectRootResponse(projectRoot: string): Record<string, unknown> {
  return {
    content: [{
      type: 'text',
      text: `拒绝执行 UI 编排：project_root 不能传带项目名的半相对路径，例如 ${projectRoot}。请改为传项目根目录绝对路径。`,
    }],
    isError: true,
    structuredContent: {
      error_code: 'INVALID_PROJECT_ROOT',
      rejected_project_root: projectRoot,
      retry_hint: buildProjectRootRetryHint(projectRoot),
    },
  };
}

function invalidModeResponse(mode: string): Record<string, unknown> {
  return {
    content: [{
      type: 'text',
      text: `❌ 无效的模式: ${mode}

**有效选项**: auto, manual

**示例**:
\`\`\`
start_ui "登录页面" --mode=manual
start_ui "用户列表" --mode=auto
\`\`\`
`,
    }],
    isError: true,
  };
}

export function normalizeStartUiRequest(args: unknown): StartUiRequestResult {
  const parsed = parseRawArgs(args);
  const explicitProjectRoot = getString(parsed.project_root);
  if (isLikelyProjectNamedRelativePath(explicitProjectRoot)) {
    return { ok: false, response: invalidProjectRootResponse(explicitProjectRoot) };
  }

  const projectRoot = resolveWorkspaceRoot(explicitProjectRoot);
  const projectRootPosix = projectRoot.replace(/\\/g, '/');
  const description = getString(parsed.description);
  const framework = getString(parsed.framework) || detectUiFramework(projectRoot);
  const rawMode = getString(parsed.mode) || 'manual';
  if (rawMode !== 'auto' && rawMode !== 'manual') {
    return { ok: false, response: invalidModeResponse(rawMode) };
  }

  const productType = inferProductType(description);
  const targetAudience = getString(parsed.target_audience);
  const screenType = getString(parsed.screen_type);
  const visualDirection = getString(parsed.visual_direction);
  const density = getString(parsed.density);
  const brandPersonality = getString(parsed.brand_personality);
  const references = getString(parsed.references);
  const avoid = getString(parsed.avoid);
  const targetScore = getNumber(parsed.target_score, 8.5);
  const visualContract = buildVisualDirectionContract({
    productType,
    description,
    stack: framework,
    targetAudience,
    screenType,
    visualDirection,
    density,
    brandPersonality,
    references,
    avoid,
    targetScore,
  });
  const profileDecision = resolveTemplateProfile(
    getString(parsed.template_profile),
    description,
  );
  const templateMeta: Record<string, string> = {
    profile: profileDecision.resolved,
    requested: profileDecision.requested,
  };
  if (profileDecision.reason) templateMeta.reason = profileDecision.reason;
  if (profileDecision.warning) templateMeta.warning = profileDecision.warning;

  const headerNotes = [
    `模板档位: ${profileDecision.resolved}${profileDecision.requested === 'auto' ? '（自动）' : ''}`,
    `视觉方向: ${visualContract.direction.name}`,
    `内容密度: ${visualContract.objective.density}`,
    `视觉目标: ${visualContract.acceptance.targetScore}/10`,
  ];
  if (profileDecision.reason) headerNotes.push(`选择理由: ${profileDecision.reason}`);
  if (profileDecision.warning) headerNotes.push(profileDecision.warning);

  return {
    ok: true,
    value: {
      description,
      framework,
      mode: rawMode,
      requirementsMode: getString(parsed.requirements_mode) || 'steady',
      maxRounds: getNumber(parsed.loop_max_rounds, 2),
      questionBudget: getNumber(parsed.loop_question_budget, 5),
      assumptionCap: getNumber(parsed.loop_assumption_cap, 3),
      reviewMaxRounds: Math.min(5, Math.max(1, getNumber(parsed.review_max_rounds, 3))),
      projectRoot,
      projectRootPosix,
      visualContract,
      designSystemArgs: {
        product_type: visualContract.objective.productType,
        description,
        stack: framework,
        target_audience: visualContract.objective.targetAudience,
        screen_type: visualContract.objective.screenType,
        visual_direction: visualContract.direction.id,
        density: visualContract.objective.density,
        brand_personality: brandPersonality,
        references,
        avoid,
        target_score: visualContract.acceptance.targetScore,
      },
      templateName: normalizeTemplateName(
        getString(parsed.template) || description || 'ui-template',
        'ui-template',
      ),
      templateMeta,
      headerNotes,
    },
  };
}
