/**
 * 索引文件模板
 * 用于生成 project-context.md（项目上下文的唯一入口）
 */

export const indexTemplate = `# 项目上下文

> 本文档是项目上下文的索引文件，提供项目概览和导航链接。

## 项目概览

| 属性 | 值 |
|------|-----|
| 名称 | [项目名称] |
| 版本 | [版本号] |
| 类型 | [项目类型] |
| 描述 | [项目描述] |

## 📚 文档导航

### [技术栈](./project-context/tech-stack.md)
了解项目使用的语言、框架、构建工具等技术选型。

**适用场景**：
- 需要了解项目技术栈
- 选择合适的库或工具
- 编写技术相关文档

### [架构设计](./project-context/architecture.md)
了解项目的目录结构、入口文件、模块划分和设计模式。

**适用场景**：
- 需要理解项目结构
- 添加新模块或功能
- 重构代码

### [编码规范](./project-context/coding-standards.md)
了解项目的代码风格、命名规范和 TypeScript 配置。

**适用场景**：
- 编写新代码
- 代码审查
- 配置开发工具

### [依赖管理](./project-context/dependencies.md)
了解项目的依赖包及其用途。

**适用场景**：
- 添加或更新依赖
- 解决依赖冲突
- 优化依赖体积

### [开发流程](./project-context/workflows.md)
了解项目的开发、构建、测试等命令。

**适用场景**：
- 启动开发环境
- 构建和部署
- 运行测试

---

*生成时间: [时间戳]*  
*生成工具: MCP Probe Kit - init_project_context (modular mode)*
`;
