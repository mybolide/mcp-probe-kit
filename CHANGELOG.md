# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.8] - 2025-10-27

### Changed
- 🚀 优化 `analyze_project` 工具，大幅提升大型项目分析性能
- 限制最多扫描 5000 个文件，防止超大项目分析超时
- 限制每个目录最多显示 50 项，避免输出过长
- 限制单个文件大小为 1MB，跳过超大文件
- 增强忽略目录列表，完全跳过 `node_modules`、`dist`、`build` 等大型目录
- 添加更多忽略目录：`vendor`、`__pycache__`、`.cache`、`bower_components` 等
- 文件类型分布按数量排序，只显示前 10 种
- 关键文件内容限制为 100 行，超长内容自动截断
- 使用相对路径显示文件，提高可读性
- 添加扫描进度日志和忽略目录提示

## [1.2.7] - 2025-10-27

### Changed
- 更新 MCP 服务器版本信息，确保所有版本号统一
- 优化服务器状态资源，用户可通过 `probe://status` 查看实时版本

## [1.2.6] - 2025-10-27

### Added
- 🎸 为 commit 类型添加 emoji 支持，提升视觉体验
- 新增 `fixed` 类型用于线上/测试缺陷修复
- 为所有 commit 类型配置 emoji 表情（🐛🎸✏️💄🤖♻️✅）
- 添加带 emoji 的 commit 消息示例

### Changed
- 更新 gencommit 工具的类型描述，区分 `fixed` 和 `fix` 的使用场景
- 优化类型排序，将 fixed/fix 放在首位

## [1.2.4] - 2025-10-26

### Added
- 添加 FAQ 常见问题解答章节
- 添加故障排查指南

### Changed
- 更新脚本和文档

## [1.2.3] - 2025-10-26

Previous versions - see [GitHub Releases](https://github.com/mybolide/mcp-probe-kit/releases)

---

[1.2.8]: https://github.com/mybolide/mcp-probe-kit/compare/v1.2.7...v1.2.8
[1.2.7]: https://github.com/mybolide/mcp-probe-kit/compare/v1.2.6...v1.2.7
[1.2.6]: https://github.com/mybolide/mcp-probe-kit/compare/v1.2.4...v1.2.6
[1.2.4]: https://github.com/mybolide/mcp-probe-kit/compare/v1.2.3...v1.2.4
[1.2.3]: https://github.com/mybolide/mcp-probe-kit/releases/tag/v1.2.3

