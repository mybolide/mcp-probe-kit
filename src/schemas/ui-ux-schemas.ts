/**
 * UI/UX Pro Max 工具的 Schema 定义
 */

export const uiDesignSystemSchema = {
  name: "ui_design_system",
  description: "生成可执行的视觉方向，而不是风格标签拼盘。输出核心任务、信息架构、内容密度、排版与色彩策略、组件原则、明确禁用项和截图验收标准。",
  inputSchema: {
    type: "object",
    properties: {
      product_type: {
        type: "string",
        description: "产品类型，如 SaaS、交易系统、医疗应用、电商或品牌官网。",
      },
      description: {
        type: "string",
        description: "页面或产品的核心任务、关键内容和使用场景。不要只写视觉形容词。",
      },
      stack: {
        type: "string",
        description: "技术栈，如 react、nextjs、vue、nuxt、html。仅影响实现建议，不决定审美。",
      },
      target_audience: {
        type: "string",
        description: "目标用户及其专业程度、使用频率和主要压力。",
      },
      screen_type: {
        type: "string",
        description: "页面类型，如 professional-dashboard、workflow-console、marketing-page、commerce-catalog、commerce-detail、content-workspace。未传时自动判断。",
      },
      visual_direction: {
        type: "string",
        description: "指定视觉方向。内置方向包括 editorial-precision、operational-clarity、calm-trust、product-storytelling、commerce-focus，也支持自定义名称。",
      },
      density: {
        type: "string",
        enum: ["compact", "comfortable", "spacious"],
        description: "内容密度。专业后台通常 compact，通用产品 comfortable，营销页 spacious。",
      },
      brand_personality: {
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
        description: "品牌气质，如 精准、可信、克制。字符串可用逗号分隔。",
      },
      references: {
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
        description: "参考产品或设计方法，如 Linear、Apple、Vercel。只提取结构方法，不照抄视觉。",
      },
      avoid: {
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } },
        ],
        description: "项目特定禁用项，如 卡片瀑布、大标题、装饰性图标、大面积空白。",
      },
      target_score: {
        type: "number",
        minimum: 7.5,
        maximum: 10,
        default: 8.5,
        description: "视觉验收目标分数。低于该分数不得交付。",
      },
      keywords: {
        type: "string",
        description: "兼容旧调用方。等价于 brand_personality，后续应改用 brand_personality。",
      },
    },
    required: ["product_type"],
  },
};

export const uiSearchSchema = {
  name: "ui_search",
  description: "搜索页面结构、组件、交互规范和实现参考。新 UI 流程优先使用 structure 模式按任务和页面类型选择信息架构；旧 search/catalog/template 模式继续兼容。",
  inputSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["structure", "search", "catalog", "template"],
        description: "structure（页面结构，推荐）、search（通用数据）、catalog（组件目录）、template（旧模板兼容）。",
        default: "search",
      },
      query: {
        type: "string",
        description: "核心任务或搜索关键词。structure 模式应描述用户要完成的任务。",
      },
      screen_type: {
        type: "string",
        description: "structure 模式的页面类型，如 professional-dashboard、workflow-console、marketing-page、commerce-catalog。",
      },
      density: {
        type: "string",
        enum: ["compact", "comfortable", "spacious"],
        description: "structure 模式的目标内容密度。",
      },
      category: {
        type: "string",
        description: "search 模式数据类别：colors、icons、charts、landing、products、typography、styles、ux-guidelines、shadcn-blocks、shadcn-components、ui-themes、ui-guidelines-vercel。",
      },
      stack: {
        type: "string",
        description: "search 模式技术栈过滤。",
      },
      limit: {
        type: "number",
        description: "返回结果数量。structure 模式默认 3、最多 5；其他模式默认 10、最多 50。",
        default: 10,
      },
      min_score: {
        type: "number",
        description: "search 模式最小相关性得分。",
        default: 0,
      },
    },
  },
};

export const syncUiDataSchema = {
  name: "sync_ui_data",
  description: "同步 UI/UX 数据到本地缓存。来源：uipro-cli、shadcn/ui registry、内嵌 UI 主题预设、Vercel Web Interface Guidelines。",
  inputSchema: {
    type: "object",
    properties: {
      force: {
        type: "boolean",
        description: "是否强制同步（忽略版本检查，默认 false）",
        default: false,
      },
      verbose: {
        type: "boolean",
        description: "是否显示详细日志（默认 false）",
        default: false,
      },
      check_only: {
        type: "boolean",
        description: "仅读取本地缓存状态，不访问网络也不写入缓存。适合诊断和自动化验收。",
        default: false,
      },
    },
  },
};

export const startUiSchema = {
  name: "start_ui",
  description: "编排 UI 设计与实现：先锁定视觉方向和信息架构，再生成关键页面，后续通过真实截图评分与迭代完成验收。",
  inputSchema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "UI 需求描述（如 '登录页面'、'用户列表'、'设置页面'）",
      },
      framework: {
        type: "string",
        description: "目标框架：react、vue、html（默认 react）",
        default: "react",
      },
      template: {
        type: "string",
        description: "模板名称（可选，不提供则自动生成）",
      },
      project_root: {
        type: "string",
        description: "项目根目录绝对路径。建议显式传入；如果存在 docs 或模板等相对路径解析，应统一相对该项目根目录处理，避免依赖客户端 cwd。",
      },
      target_audience: {
        type: "string",
        description: "目标用户及其专业程度、使用频率和主要压力。",
      },
      screen_type: {
        type: "string",
        description: "页面类型，如 professional-dashboard、workflow-console、marketing-page。未传时自动判断。",
      },
      visual_direction: {
        type: "string",
        description: "视觉方向名称。可使用内置方向或自定义方向。",
      },
      density: {
        type: "string",
        enum: ["compact", "comfortable", "spacious"],
        description: "内容密度。",
      },
      brand_personality: {
        type: "string",
        description: "品牌气质，使用逗号分隔，如 精准、可信、克制。",
      },
      references: {
        type: "string",
        description: "参考产品或方法，使用逗号分隔，如 Linear、Apple。",
      },
      avoid: {
        type: "string",
        description: "项目特定禁用项，使用逗号分隔。",
      },
      target_score: {
        type: "number",
        minimum: 7.5,
        maximum: 10,
        default: 8.5,
        description: "截图视觉验收目标分数。",
      },
      review_max_rounds: {
        type: "number",
        minimum: 1,
        maximum: 5,
        default: 3,
        description: "截图评审未达标时的最大迭代轮次。每轮必须重新生成真实截图并评分。",
      },
      template_profile: {
        type: "string",
        description: "模板档位：auto（默认，自动选择 guided/strict）、guided（普通模型友好）或 strict（结构更紧凑）",
        default: "auto",
      },
      mode: {
        type: "string",
        description: "执行模式：auto（智能）/ manual（默认）",
        default: "manual",
      },
      requirements_mode: {
        type: "string",
        description: "需求模式：steady（默认）或 loop（需求澄清与补全）",
      },
      loop_max_rounds: {
        type: "number",
        description: "需求 loop 最大轮次（默认 2）",
      },
      loop_question_budget: {
        type: "number",
        description: "每轮最多提问数量（默认 5）",
      },
      loop_assumption_cap: {
        type: "number",
        description: "每轮假设上限（默认 3）",
      },
    },
    required: ["description"],
  },
};

export const uiUxSchemas = [
  uiDesignSystemSchema,
  uiSearchSchema,
  syncUiDataSchema,
  startUiSchema,
];
