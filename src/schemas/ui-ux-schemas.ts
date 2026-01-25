/**
 * UI/UX Pro Max 工具的 Schema 定义
 */

export const uiDesignSystemSchema = {
  name: "ui_design_system",
  description: "智能设计系统生成器 - 基于产品类型和需求，使用 AI 推理引擎生成完整的设计系统推荐。包括 UI 风格、配色方案、字体配对、落地页模式、效果建议、反模式警告和交付检查清单。输出 Markdown 文档、JSON 配置和完整设计规范文档集。",
  inputSchema: {
    type: "object",
    properties: {
      product_type: {
        type: "string",
        description: "产品类型（必填）：SaaS, E-commerce, Healthcare, Fintech, Government（政府）, Education（教育）, Portfolio, Agency 等。这是推理引擎的核心输入。",
      },
      description: {
        type: "string",
        description: "系统说明（推荐）：详细描述产品功能、特点、使用场景。例如：'政府类网站，需要权威、可信、易用的设计风格，面向公众提供政务服务'。这将帮助推理引擎生成更准确的设计方案。",
      },
      stack: {
        type: "string",
        description: "技术栈（推荐）：react, vue, nextjs, nuxtjs, tailwind, html, svelte, astro 等。用于生成特定技术栈的实现建议和配置代码。",
      },
      target_audience: {
        type: "string",
        description: "目标用户（可选）：如 'B2B企业', 'C端消费者', '政府公务员', '普通市民', '开发者' 等。帮助推理引擎选择合适的设计风格。",
      },
      keywords: {
        type: "string",
        description: "关键词（可选）：逗号分隔的关键词，如 'professional, modern, trustworthy, authoritative'（专业、现代、可信、权威）。用于辅助匹配设计风格。",
      },
    },
    required: ["product_type"],
  },
};

export const initComponentCatalogSchema = {
  name: "init_component_catalog",
  description: "初始化组件目录 - 基于设计系统规范（design-system.json）生成组件目录文件。定义可用的 UI 组件及其属性，组件定义包含占位符，渲染时自动替换为设计规范中的实际值，确保样式统一。",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export const uiSearchSchema = {
  name: "ui_search",
  description: "搜索 UI/UX 数据库，包括颜色、图标、图表、组件、设计模式等。支持三种模式：search（搜索数据）、catalog（查看组件目录）、template（搜索 UI 模板）。使用 BM25 算法进行智能搜索，支持按类别和技术栈过滤。数据来源：uipro-cli npm 包（v2.2.0+）。",
  inputSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description: "搜索模式：search（搜索 UI/UX 数据，默认）、catalog（查看组件目录）、template（搜索 UI 模板）",
        default: "search",
      },
      query: {
        type: "string",
        description: "搜索关键词（支持中英文，如 'button'、'按钮'、'primary color'、'主色调'）。catalog 模式不需要此参数。",
      },
      category: {
        type: "string",
        description: "数据类别（仅 search 模式）：colors（颜色）、icons（图标）、charts（图表）、landing（落地页）、products（产品）、typography（字体）、styles（样式）、ux-guidelines（UX 指南）、web-interface（Web 界面）等",
      },
      stack: {
        type: "string",
        description: "技术栈过滤（仅 search 模式）：react、vue、nextjs、nuxtjs、svelte、astro、flutter、react-native、swiftui、jetpack-compose 等",
      },
      limit: {
        type: "number",
        description: "返回结果数量（默认 10，范围 1-50）",
        default: 10,
      },
      min_score: {
        type: "number",
        description: "最小相关性得分（默认 0，范围 0-100）",
        default: 0,
      },
    },
  },
};

export const syncUiDataSchema = {
  name: "sync_ui_data",
  description: "同步 UI/UX 数据到本地缓存。从 npm 包 uipro-cli 下载最新数据，支持自动检查更新和强制同步。数据存储在 ~/.mcp-probe-kit/ui-ux-data/。",
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
    },
  },
};

export const renderUiSchema = {
  name: "render_ui",
  description: "UI 渲染引擎 - 将 JSON 模板渲染为最终代码。自动读取设计规范（design-system.json）和组件目录（component-catalog.json），替换占位符，生成完整的 React/Vue/HTML 代码。确保所有组件样式统一。",
  inputSchema: {
    type: "object",
    properties: {
      template: {
        type: "string",
        description: "模板文件路径（JSON 格式，如 docs/ui/login-form.json）",
      },
      framework: {
        type: "string",
        description: "目标框架：react、vue、html（默认 react）",
        default: "react",
      },
    },
    required: ["template"],
  },
};

export const startUiSchema = {
  name: "start_ui",
  description: "统一 UI 开发编排工具 - 一键完成整个 UI 开发流程。自动检查设计系统、生成组件目录、搜索/生成模板、渲染最终代码。适合快速原型开发，保证整个项目样式统一。",
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
    },
    required: ["description"],
  },
};

export const uiUxSchemas = [
  uiDesignSystemSchema,
  initComponentCatalogSchema,
  uiSearchSchema,
  syncUiDataSchema,
  renderUiSchema,
  startUiSchema,
];
