import { VISUAL_DIRECTION_PRESETS } from './visual-direction-presets.js';

export type UiDensity = 'compact' | 'comfortable' | 'spacious';

export interface VisualDirectionRequest {
  productType: string;
  description?: string;
  stack?: string;
  targetAudience?: string;
  screenType?: string;
  visualDirection?: string;
  density?: string;
  brandPersonality?: string | string[];
  references?: string | string[];
  avoid?: string | string[];
  targetScore?: number;
}

export interface VisualDirectionContract {
  contractVersion: '2.0';
  summary: string;
  objective: {
    productType: string;
    screenType: string;
    primaryTask: string;
    targetAudience: string;
    density: UiDensity;
  };
  direction: {
    id: string;
    name: string;
    rationale: string;
    personality: string[];
    referenceLessons: Array<{
      reference: string;
      lesson: string;
    }>;
  };
  informationArchitecture: {
    hierarchy: string[];
    layout: string;
    navigation: string;
    responsive: string[];
  };
  visualLanguage: {
    typography: {
      familyStrategy: string;
      scale: Record<string, string>;
      weights: Record<string, number>;
      lineHeights: Record<string, string>;
    };
    color: {
      strategy: string;
      tokens: Record<string, string>;
      accentUsage: string;
    };
    shape: {
      radius: Record<string, string>;
      border: string;
    };
    depth: {
      strategy: string;
      shadows: Record<string, string>;
    };
    imagery: string;
    motion: string;
    spacing: {
      base: number;
      scale: number[];
      sectionGap: string;
    };
  };
  componentRules: Array<{
    component: string;
    rule: string;
  }>;
  contentRules: string[];
  avoid: string[];
  acceptance: {
    targetScore: number;
    dimensions: Array<{
      name: string;
      weight: number;
      pass: string;
    }>;
    requiredViewports: string[];
    blockingFailures: string[];
  };
  artifacts: Array<{
    path: string;
    purpose: string;
  }>;
}

export interface DirectionPreset {
  id: string;
  name: string;
  rationale: string;
  personality: string[];
  palette: Record<string, string>;
  layoutByScreen: Partial<Record<string, string>>;
  defaultLayout: string;
  navigation: string;
  imagery: string;
  componentRules: VisualDirectionContract['componentRules'];
  avoid: string[];
}



const GLOBAL_AVOID = [
  '默认紫蓝渐变',
  '无真实层次的 Glassmorphism',
  'Neumorphism 或 Claymorphism',
  '相同卡片等距网格',
  '嵌套卡片',
  'gradient text',
  '装饰性 3D 球、光斑和漂浮图形',
  '默认 Inter / Roboto / Open Sans',
  '每个区块都使用小号大写 eyebrow',
  '未经截图复核就宣称视觉完成',
];

const REFERENCE_LESSONS: Record<string, string> = {
  apple: '学习编辑式层级、克制留白和产品内容主导，不复制大标题或品牌外观。',
  linear: '学习紧凑密度、精确边界、快捷操作和低噪声状态表达。',
  vercel: '学习开发者产品的信息清晰度、直接文案和稳定的黑白层级。',
  stripe: '学习复杂商业信息的叙事顺序、证据组织和渐进披露。',
  notion: '学习内容优先、安静界面和灵活工作区，不复制其组件外观。',
  bloomberg: '学习高密度数据的层级、对齐和异常突出，不复制终端配色。',
};

function list(value?: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/[，,;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function clampTargetScore(value?: number): number {
  if (!Number.isFinite(value)) return 8.5;
  return Math.min(10, Math.max(7.5, Number(value)));
}

function inferScreenType(request: VisualDirectionRequest): string {
  const explicit = String(request.screenType || '').trim();
  if (explicit) return explicit;
  const text = `${request.productType} ${request.description || ''}`.toLowerCase();
  if (/交易|行情|监控|dashboard|analytics|看板|指标|报表|数据大屏/.test(text)) return 'professional-dashboard';
  if (/后台|管理|审批|工单|workflow|console|列表|运营|crm|erp/.test(text)) return 'workflow-console';
  if (/官网|落地页|landing|marketing|品牌站|宣传/.test(text)) return 'marketing-page';
  if (/商城|电商|catalog|商品列表|购物/.test(text)) return 'commerce-catalog';
  if (/商品详情|product detail|购买页/.test(text)) return 'commerce-detail';
  if (/编辑器|知识库|文档|workspace|内容管理/.test(text)) return 'content-workspace';
  return 'product-interface';
}

function inferDensity(requested: string | undefined, screenType: string): UiDensity {
  const value = String(requested || '').trim().toLowerCase();
  if (value === 'compact' || value === 'comfortable' || value === 'spacious') return value;
  if (screenType === 'professional-dashboard' || screenType === 'workflow-console') return 'compact';
  if (screenType === 'marketing-page') return 'spacious';
  return 'comfortable';
}

function inferPresetId(request: VisualDirectionRequest, screenType: string): string {
  const explicit = String(request.visualDirection || '').trim().toLowerCase().replace(/\s+/g, '-');
  const aliases: Record<string, string> = {
    editorial: 'editorial-precision',
    precision: 'editorial-precision',
    linear: 'editorial-precision',
    operational: 'operational-clarity',
    enterprise: 'operational-clarity',
    calm: 'calm-trust',
    trust: 'calm-trust',
    storytelling: 'product-storytelling',
    marketing: 'product-storytelling',
    commerce: 'commerce-focus',
  };
  if (VISUAL_DIRECTION_PRESETS[explicit]) return explicit;
  if (aliases[explicit]) return aliases[explicit];

  const text = `${request.productType} ${request.description || ''}`.toLowerCase();
  if (/医疗|health|clinic|hospital|政府|public service|政务|公益/.test(text)) return 'calm-trust';
  if (screenType.startsWith('commerce-')) return 'commerce-focus';
  if (screenType === 'marketing-page') return 'product-storytelling';
  if (screenType === 'workflow-console') return 'operational-clarity';
  if (screenType === 'professional-dashboard' || screenType === 'content-workspace') return 'editorial-precision';
  return 'operational-clarity';
}

function inferPrimaryTask(description?: string): string {
  const compact = String(description || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '让用户快速理解当前状态并完成核心任务';
  const first = compact.split(/[。！？.!?]/)[0]?.trim() || compact;
  return first.length > 72 ? `${first.slice(0, 71)}…` : first;
}

function referenceLessons(references: string[]): VisualDirectionContract['direction']['referenceLessons'] {
  return references.map((reference) => {
    const key = reference.toLowerCase();
    const matched = Object.entries(REFERENCE_LESSONS).find(([name]) => key.includes(name));
    return {
      reference,
      lesson: matched?.[1] || '仅提取其信息组织、层级和交互方法，不复制品牌视觉或组件外观。',
    };
  });
}

function layoutFor(preset: DirectionPreset, screenType: string): string {
  return preset.layoutByScreen[screenType] || preset.defaultLayout;
}

function responsiveRules(screenType: string, density: UiDensity): string[] {
  const rules = [
    '1440px：展示完整导航、工具栏和主内容层级；避免无意义拉宽正文。',
    '768px：次要侧区转为抽屉或折叠区，核心操作保持可见。',
    '390px：单列任务流；筛选与次要操作收入口袋面板，禁止横向页面滚动。',
  ];
  if (screenType === 'professional-dashboard') {
    rules.push('移动端不缩小桌面大盘；改为关键指标、异常列表和可钻取明细。');
  }
  if (density === 'compact') {
    rules.push('紧凑密度只用于桌面；触控布局仍保证 44px 命中区。');
  }
  return rules;
}

export function buildVisualDirectionContract(request: VisualDirectionRequest): VisualDirectionContract {
  const productType = String(request.productType || 'Product').trim() || 'Product';
  const screenType = inferScreenType(request);
  const density = inferDensity(request.density, screenType);
  const preset = VISUAL_DIRECTION_PRESETS[inferPresetId(request, screenType)];
  const references = list(request.references);
  const userPersonality = list(request.brandPersonality);
  const userAvoid = list(request.avoid);
  const targetAudience = String(request.targetAudience || '').trim() || '该产品的核心用户';
  const targetScore = clampTargetScore(request.targetScore);

  const typographyScale = density === 'compact'
    ? { display: '2rem', h1: '1.625rem', h2: '1.25rem', h3: '1rem', body: '1rem', dense: '0.875rem', meta: '0.8125rem' }
    : density === 'spacious'
      ? { display: 'clamp(2.75rem, 6vw, 5rem)', h1: '2.25rem', h2: '1.625rem', h3: '1.25rem', body: '1rem', dense: '0.9375rem', meta: '0.875rem' }
      : { display: '2.5rem', h1: '2rem', h2: '1.5rem', h3: '1.125rem', body: '1rem', dense: '0.9375rem', meta: '0.875rem' };

  const contract: VisualDirectionContract = {
    contractVersion: '2.0',
    summary: `${preset.name} · ${screenType} · ${density}`,
    objective: {
      productType,
      screenType,
      primaryTask: inferPrimaryTask(request.description),
      targetAudience,
      density,
    },
    direction: {
      id: preset.id,
      name: preset.name,
      rationale: preset.rationale,
      personality: unique([...userPersonality, ...preset.personality]).slice(0, 6),
      referenceLessons: referenceLessons(references),
    },
    informationArchitecture: {
      hierarchy: [
        '当前任务、关键状态和主要动作',
        '支持判断与执行的核心内容',
        '异常、风险与需要关注的变化',
        '辅助上下文、历史和低频设置',
      ],
      layout: layoutFor(preset, screenType),
      navigation: preset.navigation,
      responsive: responsiveRules(screenType, density),
    },
    visualLanguage: {
      typography: {
        familyStrategy: '优先沿用项目现有品牌字体；无品牌字体时使用系统 UI 字体栈与中文系统字体，不默认引入 Inter。',
        scale: typographyScale,
        weights: { regular: 400, medium: 500, semibold: 600 },
        lineHeights: { display: '1.08', heading: '1.2', body: '1.6', dense: '1.4' },
      },
      color: {
        strategy: '中性色承担约 90% 画面；单一强调色只用于当前状态、主要动作和必要高亮；语义色保持独立。',
        tokens: { ...preset.palette },
        accentUsage: '同一屏最多一个高权重强调区域；禁止把强调色铺满卡片、图标和标题。',
      },
      shape: {
        radius: { control: '6px', panel: '8px', card: '10px', overlay: '12px' },
        border: '1px solid var(--line)，边界优先于阴影；圆角必须来自固定阶梯。',
      },
      depth: {
        strategy: '默认扁平分层；浮层、拖拽对象和临时反馈才允许阴影。',
        shadows: {
          subtle: '0 1px 2px rgb(0 0 0 / 0.05)',
          overlay: '0 12px 32px rgb(0 0 0 / 0.12)',
        },
      },
      imagery: preset.imagery,
      motion: '只动画状态变化、层级进入和直接操作反馈；150-240ms ease-out，并提供 reduced-motion 分支。',
      spacing: {
        base: 4,
        scale: [4, 8, 12, 16, 24, 32, 48, 64, 96],
        sectionGap: density === 'compact' ? '24-32px' : density === 'spacious' ? '64-96px' : '40-64px',
      },
    },
    componentRules: preset.componentRules,
    contentRules: [
      '标题说明用户能完成什么或当前发生了什么，不写空泛品牌口号。',
      '按钮使用结果导向动词，避免“确定”“立即体验”“赋能”等泛化文案。',
      '状态、空态、错误和权限提示必须说明原因与下一步。',
      '真实业务内容优先于占位符；没有真实数据时使用明确的示例数据标识。',
    ],
    avoid: unique([...GLOBAL_AVOID, ...preset.avoid, ...userAvoid]),
    acceptance: {
      targetScore,
      dimensions: [
        { name: '信息层级', weight: 20, pass: '5 秒内能指出页面主任务、当前状态和主要动作。' },
        { name: '版式与留白', weight: 20, pass: '分区清晰、对齐稳定、空白有节奏，不靠卡片填满画面。' },
        { name: '风格一致性', weight: 15, pass: '字体、颜色、圆角、边界和状态表达来自同一套规则。' },
        { name: '内容密度', weight: 15, pass: '密度符合任务，不出现无意义空白或信息堆叠。' },
        { name: '组件克制程度', weight: 10, pass: '没有卡片瀑布、嵌套卡片和平均强调。' },
        { name: '品牌辨识度', weight: 10, pass: '通过内容、排版和单一强调策略形成识别，不依赖特效。' },
        { name: '响应式表现', weight: 10, pass: '1440px 与 390px 都保持任务顺序、可读性和可操作性。' },
      ],
      requiredViewports: ['1440x900', '390x844'],
      blockingFailures: [
        '任何目标视口出现横向页面滚动',
        '命中全局或用户禁用项',
        '主要操作、状态或错误只靠颜色表达',
        '没有真实渲染截图或截图未覆盖关键页面',
      ],
    },
    artifacts: [
      { path: 'docs/design-system.json', purpose: '机器可读的视觉方向、Token、组件规则和验收标准。' },
      { path: 'docs/design-system.md', purpose: '供 Agent 与设计评审使用的精简视觉方向说明。' },
    ],
  };

  const explicit = String(request.visualDirection || '').trim();
  if (explicit && !VISUAL_DIRECTION_PRESETS[explicit.toLowerCase().replace(/\s+/g, '-')]) {
    contract.direction.name = explicit;
    contract.direction.id = explicit.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '') || preset.id;
    contract.direction.rationale = `以“${explicit}”为用户指定方向，并使用 ${preset.name} 的信息架构和可用性约束保证可执行性。`;
  }

  return contract;
}

export function renderVisualDirectionBrief(contract: VisualDirectionContract): string {
  const components = contract.componentRules
    .map((item) => `- **${item.component}**：${item.rule}`)
    .join('\n');
  const avoid = contract.avoid.map((item) => `- ${item}`).join('\n');
  const references = contract.direction.referenceLessons.length
    ? contract.direction.referenceLessons.map((item) => `- **${item.reference}**：${item.lesson}`).join('\n')
    : '- 无指定参考；按当前视觉方向执行，不套用通用后台模板。';

  return `# 视觉方向：${contract.direction.name}

- **页面类型**：${contract.objective.screenType}
- **核心任务**：${contract.objective.primaryTask}
- **目标用户**：${contract.objective.targetAudience}
- **内容密度**：${contract.objective.density}
- **目标评分**：${contract.acceptance.targetScore}/10

## 设计判断

${contract.direction.rationale}

**气质**：${contract.direction.personality.join('、')}

## 信息架构

- **版式**：${contract.informationArchitecture.layout}
- **导航**：${contract.informationArchitecture.navigation}
- **视觉顺序**：${contract.informationArchitecture.hierarchy.join(' → ')}

## 视觉语言

- **字体**：${contract.visualLanguage.typography.familyStrategy}
- **色彩**：${contract.visualLanguage.color.strategy}
- **形态**：${contract.visualLanguage.shape.border}
- **层次**：${contract.visualLanguage.depth.strategy}
- **图片**：${contract.visualLanguage.imagery}
- **动效**：${contract.visualLanguage.motion}

## 组件原则

${components}

## 参考方法

${references}

## 明确禁止

${avoid}

## 交付标准

必须生成 ${contract.acceptance.requiredViewports.join(' 和 ')} 真实截图，并按 7 个维度评分。低于 ${contract.acceptance.targetScore}/10 或命中阻断项，不得交付。

只创建以下两份设计产物：
${contract.artifacts.map((item) => `- \`${item.path}\`：${item.purpose}`).join('\n')}`;
}
