/**
 * 文档模板配置
 * 
 * 根据项目类型（category）定义需要生成的文档列表
 */

export interface DocumentTemplate {
  filename: string;           // 文件名（不含路径）
  title: string;              // 文档标题
  purpose: string;            // 文档用途说明
}

/**
 * 根据项目类型获取文档列表
 */
export function getDocumentTemplates(category: string): DocumentTemplate[] {
  const templates = documentTemplatesByCategory[category];
  
  if (!templates) {
    // 未知类型，返回通用模板
    return documentTemplatesByCategory['unknown'];
  }
  
  return templates;
}

/**
 * 各类型项目的文档模板配置
 */
const documentTemplatesByCategory: Record<string, DocumentTemplate[]> = {
  // 后端 API 项目
  'backend-api': [
    {
      filename: 'how-to-add-api.md',
      title: '如何添加新接口',
      purpose: '指导开发者如何在项目中添加新的 API 接口'
    },
    {
      filename: 'how-to-database.md',
      title: '如何操作数据库',
      purpose: '指导开发者如何连接和操作数据库'
    },
    {
      filename: 'how-to-auth.md',
      title: '如何处理认证',
      purpose: '指导开发者如何实现用户认证和授权'
    },
    {
      filename: 'how-to-test.md',
      title: '如何编写测试',
      purpose: '指导开发者如何编写单元测试和集成测试'
    },
    {
      filename: 'how-to-deploy.md',
      title: '如何部署',
      purpose: '指导开发者如何部署应用到生产环境'
    }
  ],
  
  // 前端 SPA 项目
  'frontend-spa': [
    {
      filename: 'how-to-new-page.md',
      title: '如何创建新页面',
      purpose: '指导开发者如何创建新的页面组件'
    },
    {
      filename: 'how-to-call-api.md',
      title: '如何调用 API',
      purpose: '指导开发者如何调用后端 API 接口'
    },
    {
      filename: 'how-to-state.md',
      title: '如何管理状态',
      purpose: '指导开发者如何使用状态管理工具'
    },
    {
      filename: 'how-to-routing.md',
      title: '如何处理路由',
      purpose: '指导开发者如何配置和使用路由'
    },
    {
      filename: 'how-to-styling.md',
      title: '如何处理样式',
      purpose: '指导开发者如何编写和组织样式代码'
    }
  ],
  
  // 全栈项目
  'fullstack': [
    {
      filename: 'how-to-new-feature.md',
      title: '如何开发新功能',
      purpose: '指导开发者如何开发前后端联动的新功能'
    },
    {
      filename: 'how-to-api-route.md',
      title: '如何添加 API 路由',
      purpose: '指导开发者如何添加服务端 API 路由'
    },
    {
      filename: 'how-to-new-page.md',
      title: '如何创建新页面',
      purpose: '指导开发者如何创建新的页面'
    },
    {
      filename: 'how-to-database.md',
      title: '如何操作数据库',
      purpose: '指导开发者如何连接和操作数据库'
    },
    {
      filename: 'how-to-deploy.md',
      title: '如何部署',
      purpose: '指导开发者如何部署全栈应用'
    }
  ],
  
  // 移动端项目
  'mobile': [
    {
      filename: 'how-to-new-screen.md',
      title: '如何创建新屏幕',
      purpose: '指导开发者如何创建新的屏幕页面'
    },
    {
      filename: 'how-to-navigation.md',
      title: '如何处理导航',
      purpose: '指导开发者如何配置和使用导航'
    },
    {
      filename: 'how-to-api.md',
      title: '如何调用 API',
      purpose: '指导开发者如何调用后端 API'
    },
    {
      filename: 'how-to-state.md',
      title: '如何管理状态',
      purpose: '指导开发者如何管理应用状态'
    },
    {
      filename: 'how-to-build.md',
      title: '如何构建和发布',
      purpose: '指导开发者如何构建和发布应用'
    }
  ],
  
  // 桌面应用项目
  'desktop': [
    {
      filename: 'how-to-new-window.md',
      title: '如何创建新窗口',
      purpose: '指导开发者如何创建新的窗口'
    },
    {
      filename: 'how-to-ipc.md',
      title: '如何进程通信',
      purpose: '指导开发者如何实现主进程和渲染进程通信'
    },
    {
      filename: 'how-to-native.md',
      title: '如何调用原生 API',
      purpose: '指导开发者如何调用系统原生 API'
    },
    {
      filename: 'how-to-package.md',
      title: '如何打包',
      purpose: '指导开发者如何打包桌面应用'
    }
  ],
  
  // 数据科学项目
  'data-science': [
    {
      filename: 'how-to-new-analysis.md',
      title: '如何开始新分析',
      purpose: '指导开发者如何创建新的数据分析任务'
    },
    {
      filename: 'how-to-data-load.md',
      title: '如何加载数据',
      purpose: '指导开发者如何加载和预处理数据'
    },
    {
      filename: 'how-to-visualize.md',
      title: '如何可视化',
      purpose: '指导开发者如何创建数据可视化'
    },
    {
      filename: 'how-to-model.md',
      title: '如何训练模型',
      purpose: '指导开发者如何训练和评估机器学习模型'
    }
  ],
  
  // CLI 工具项目
  'cli': [
    {
      filename: 'how-to-new-command.md',
      title: '如何添加新命令',
      purpose: '指导开发者如何添加新的 CLI 命令'
    },
    {
      filename: 'how-to-args.md',
      title: '如何处理参数',
      purpose: '指导开发者如何解析和验证命令行参数'
    },
    {
      filename: 'how-to-test.md',
      title: '如何测试',
      purpose: '指导开发者如何测试 CLI 工具'
    },
    {
      filename: 'how-to-publish.md',
      title: '如何发布',
      purpose: '指导开发者如何发布 CLI 工具'
    }
  ],
  
  // 库/SDK 项目
  'library': [
    {
      filename: 'how-to-new-api.md',
      title: '如何添加新 API',
      purpose: '指导开发者如何添加新的公共 API'
    },
    {
      filename: 'how-to-test.md',
      title: '如何测试',
      purpose: '指导开发者如何编写测试'
    },
    {
      filename: 'how-to-docs.md',
      title: '如何写文档',
      purpose: '指导开发者如何编写 API 文档'
    },
    {
      filename: 'how-to-publish.md',
      title: '如何发布',
      purpose: '指导开发者如何发布新版本'
    }
  ],
  
  // 未知类型（通用）
  'unknown': [
    {
      filename: 'project-overview.md',
      title: '项目概览',
      purpose: '项目的基本信息和技术栈'
    },
    {
      filename: 'project-structure.md',
      title: '项目结构',
      purpose: '项目的目录结构和代码组织'
    },
    {
      filename: 'development-guide.md',
      title: '开发指南',
      purpose: '如何在项目中进行开发'
    },
    {
      filename: 'testing-guide.md',
      title: '测试指南',
      purpose: '如何运行和编写测试'
    }
  ]
};
