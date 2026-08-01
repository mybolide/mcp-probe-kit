export interface UiStructurePattern {
  id: string;
  title: string;
  description: string;
  screenTypes: string[];
  densities: Array<'compact' | 'comfortable' | 'spacious'>;
  keywords: string[];
  regions: Array<{
    name: string;
    purpose: string;
    priority: 'primary' | 'secondary' | 'supporting';
  }>;
  flow: string[];
  interaction: string;
  responsive: string[];
  useWhen: string[];
  avoid: string[];
  referenceMethods: string[];
}

export interface UiStructureMatch {
  pattern: UiStructurePattern;
  score: number;
  reasons: string[];
}

const PATTERNS: UiStructurePattern[] = [
  {
    id: 'signal-workbench',
    title: 'Signal Workbench',
    description: '面向实时监控、交易、运营和异常处置的高密度工作台。重点是状态、变化、异常和下一动作。',
    screenTypes: ['professional-dashboard'],
    densities: ['compact'],
    keywords: ['交易', '行情', '机会', '策略', '监控', '实时', '异常', '指标', 'dashboard', 'analytics'],
    regions: [
      { name: 'persistent-navigation', purpose: '稳定工作域和全局日期/环境切换', priority: 'secondary' },
      { name: 'decision-toolbar', purpose: '当前范围、日期、状态和主要动作', priority: 'primary' },
      { name: 'primary-canvas', purpose: '最重要的信号、列表、图表或任务结果', priority: 'primary' },
      { name: 'exception-queue', purpose: '阻断、风险和需要人工处理的变化', priority: 'primary' },
      { name: 'context-inspector', purpose: '当前选中对象的证据、历史和明细', priority: 'supporting' },
    ],
    flow: ['确认当前范围', '识别最重要变化', '选择对象', '查看证据', '执行或记录决策'],
    interaction: '主画布和检查器联动；筛选不跳页；选中状态可恢复；实时更新不得打断当前阅读。',
    responsive: [
      '1440px：侧栏、主画布和检查器可同时存在。',
      '768px：检查器转抽屉，异常队列保持可达。',
      '390px：改为关键状态、异常列表和对象明细三层，不缩放桌面大盘。',
    ],
    useWhen: ['用户高频查看变化', '需要从状态进入证据', '存在异常或风险队列'],
    avoid: ['顶部一排装饰统计卡', '每个指标独立成卡', '图表与操作分散在多个页面'],
    referenceMethods: ['Bloomberg 的数据层级方法', 'Linear 的紧凑交互方法'],
  },
  {
    id: 'list-inspector-workflow',
    title: 'List + Inspector Workflow',
    description: '面向订单、审批、客户、工单和资产管理的列表—详情工作流。',
    screenTypes: ['workflow-console', 'content-workspace'],
    densities: ['compact', 'comfortable'],
    keywords: ['订单', '审批', '工单', '用户管理', '客户', '列表', '批量', 'crm', 'erp', 'workflow'],
    regions: [
      { name: 'navigation', purpose: '工作域与保存视图', priority: 'secondary' },
      { name: 'page-toolbar', purpose: '标题、范围、搜索、筛选和主要动作', priority: 'primary' },
      { name: 'result-list', purpose: '可排序、筛选、批量操作的主数据集', priority: 'primary' },
      { name: 'detail-inspector', purpose: '选中对象详情、历史和操作', priority: 'primary' },
      { name: 'bulk-action-bar', purpose: '只在选中对象后出现的批量动作', priority: 'supporting' },
    ],
    flow: ['缩小范围', '扫描列表', '选择对象', '就地查看或编辑', '返回原位置继续处理'],
    interaction: 'URL 保存筛选和选中项；详情优先分栏或抽屉；批量动作按选择状态出现。',
    responsive: [
      '1440px：列表与检查器并列。',
      '768px：检查器覆盖主区但保留返回位置。',
      '390px：列表和详情分层，筛选进入全屏面板。',
    ],
    useWhen: ['任务围绕对象集合', '用户需要连续处理多条记录', '详情与列表强关联'],
    avoid: ['每条记录使用大型卡片', '所有列都在移动端保留', '编辑对象必须跳到独立页面'],
    referenceMethods: ['Linear 的列表与详情联动', 'Notion 的安静工作区方法'],
  },
  {
    id: 'guided-task-flow',
    title: 'Guided Task Flow',
    description: '面向申请、配置、支付、发布和高风险操作的单一任务流。',
    screenTypes: ['product-interface', 'workflow-console'],
    densities: ['comfortable'],
    keywords: ['申请', '配置', '创建', '提交', '支付', '发布', '注册', '设置', '向导', 'form'],
    regions: [
      { name: 'task-header', purpose: '任务名称、当前步骤和退出路径', priority: 'primary' },
      { name: 'task-content', purpose: '当前步骤的字段、说明和选择', priority: 'primary' },
      { name: 'context-help', purpose: '规则、示例和风险提示', priority: 'supporting' },
      { name: 'action-footer', purpose: '返回、保存和继续', priority: 'primary' },
    ],
    flow: ['理解要求', '完成当前步骤', '即时校验', '复核影响', '提交并确认结果'],
    interaction: '每步只解决一个决策；保存草稿；错误就近；高风险提交前显示影响摘要。',
    responsive: [
      '桌面：内容与帮助双栏。',
      '移动：帮助折叠到字段附近，操作栏保持可达。',
    ],
    useWhen: ['任务有明确开始和完成', '存在校验或高风险确认', '字段较多但可分组'],
    avoid: ['一次展示全部字段', '连续弹窗确认', '只有顶部步骤条没有任务解释'],
    referenceMethods: ['Stripe 的渐进披露方法', '政府服务的明确任务语言'],
  },
  {
    id: 'editorial-product-story',
    title: 'Editorial Product Story',
    description: '面向官网、产品发布和品牌叙事的编辑式页面结构，以真实产品证据替代功能卡片模板。',
    screenTypes: ['marketing-page'],
    densities: ['spacious'],
    keywords: ['官网', '品牌', '产品介绍', 'landing', 'marketing', '发布', '宣传', '首页'],
    regions: [
      { name: 'editorial-hero', purpose: '一句明确价值、真实产品画面和主动作', priority: 'primary' },
      { name: 'product-proof', purpose: '真实界面、数据或客户结果', priority: 'primary' },
      { name: 'working-model', purpose: '展示产品如何工作，而不是罗列功能', priority: 'primary' },
      { name: 'trust-evidence', purpose: '案例、方法、保障或技术证据', priority: 'secondary' },
      { name: 'closing-action', purpose: '唯一主意图的收口动作', priority: 'primary' },
    ],
    flow: ['理解价值', '看到产品', '理解工作方式', '验证可信度', '采取行动'],
    interaction: '区块宽度和内容形态形成节奏；动效只解释产品；全页主 CTA 意图一致。',
    responsive: [
      '桌面：图文交错但保持阅读顺序。',
      '移动：先价值和证据，再图像；不保留纯装饰大空白。',
    ],
    useWhen: ['需要解释新产品', '有真实产品画面或案例', '用户需要建立信任后行动'],
    avoid: ['Hero + 三等分卡片 + CTA', 'logo 墙代替证据', '多个相似 CTA'],
    referenceMethods: ['Apple 的编辑式层级', 'Stripe 的商业叙事方法'],
  },
  {
    id: 'catalog-decision-grid',
    title: 'Catalog Decision Grid',
    description: '面向商品或方案发现与比较的目录结构，强调筛选、差异和可信购买信息。',
    screenTypes: ['commerce-catalog'],
    densities: ['comfortable'],
    keywords: ['商城', '商品列表', '目录', '筛选', '比较', '电商', 'catalog', 'shop'],
    regions: [
      { name: 'catalog-header', purpose: '分类、结果数量和排序', priority: 'secondary' },
      { name: 'filter-system', purpose: '关键属性筛选和已选条件', priority: 'primary' },
      { name: 'product-grid', purpose: '统一结构的商品比较', priority: 'primary' },
      { name: 'decision-support', purpose: '配送、保障、评价和比较入口', priority: 'supporting' },
    ],
    flow: ['选择分类', '缩小范围', '比较关键差异', '查看详情', '购买或保存'],
    interaction: '筛选即时反馈且可撤销；商品卡只展示比较所需字段；列表位置可恢复。',
    responsive: [
      '桌面：筛选侧栏或顶部组合。',
      '移动：筛选进入底部或全屏面板，已选条件持续可见。',
    ],
    useWhen: ['对象数量多', '用户需要筛选和比较', '购买决策依赖多个属性'],
    avoid: ['每张卡多个按钮', '促销标签覆盖商品信息', '无限横向轮播代替目录'],
    referenceMethods: ['成熟零售目录的信息比较方法'],
  },
  {
    id: 'detail-decision-page',
    title: 'Detail Decision Page',
    description: '面向商品、方案、资产或策略详情的决策页面，把核心内容、证据与动作组织在同一上下文。',
    screenTypes: ['commerce-detail', 'product-interface'],
    densities: ['comfortable', 'compact'],
    keywords: ['详情', '产品详情', '策略详情', '资产详情', '购买', '证据', '历史'],
    regions: [
      { name: 'identity-and-state', purpose: '对象名称、当前状态和关键上下文', priority: 'primary' },
      { name: 'primary-evidence', purpose: '图像、数据、趋势或核心说明', priority: 'primary' },
      { name: 'decision-panel', purpose: '主要动作、价格、风险或下一步', priority: 'primary' },
      { name: 'supporting-sections', purpose: '规格、历史、评价、日志和关联对象', priority: 'secondary' },
    ],
    flow: ['确认对象', '理解当前状态', '查看关键证据', '评估影响', '执行动作'],
    interaction: '主要动作与关键证据同屏；深层信息渐进披露；返回时保持来源上下文。',
    responsive: [
      '桌面：证据区和决策区并列。',
      '移动：决策区跟随核心证据之后，主要动作可粘性但不遮挡内容。',
    ],
    useWhen: ['需要对单个对象做判断', '存在证据、历史和主要动作', '详情来自列表或搜索'],
    avoid: ['摘要信息拆成大量小卡', '主要动作远离证据', '长页面没有章节导航'],
    referenceMethods: ['Stripe 的复杂信息分组', 'Linear 的对象上下文保持'],
  },
];

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[\s,，。；;、/\\()\[\]{}:：_-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

export function searchUiStructures(input: {
  query?: string;
  screenType?: string;
  density?: string;
  limit?: number;
}): UiStructureMatch[] {
  const query = String(input.query || '');
  const screenType = String(input.screenType || '').trim();
  const density = String(input.density || '').trim();
  const queryWords = words(query);

  const matches = PATTERNS.map((pattern) => {
    let score = 0;
    const reasons: string[] = [];

    if (screenType && pattern.screenTypes.includes(screenType)) {
      score += 60;
      reasons.push(`页面类型匹配：${screenType}`);
    }
    if (density && pattern.densities.includes(density as any)) {
      score += 15;
      reasons.push(`内容密度匹配：${density}`);
    }

    const haystack = `${pattern.title} ${pattern.description} ${pattern.keywords.join(' ')} ${pattern.useWhen.join(' ')}`.toLowerCase();
    let matchedWords = 0;
    for (const word of queryWords) {
      if (haystack.includes(word)) matchedWords += 1;
    }
    if (matchedWords > 0) {
      score += Math.min(25, matchedWords * 5);
      reasons.push(`任务关键词匹配：${matchedWords} 项`);
    }

    if (!screenType && !queryWords.length) score = 1;
    return { pattern, score, reasons };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.pattern.id.localeCompare(b.pattern.id));

  const limit = Math.min(5, Math.max(1, Number(input.limit) || 3));
  return matches.slice(0, limit).map((item) => ({
    ...item,
    score: Math.min(100, item.score),
  }));
}

export function getUiStructurePatterns(): readonly UiStructurePattern[] {
  return PATTERNS;
}
