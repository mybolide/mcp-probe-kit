# MCP Probe Kit v4.0 Tasks

## R0 基线与规格

- [x] 创建隔离开发分支 `develop/v4`
- [x] 固定 v3.7 测试基线
- [x] 建立 requirements、design、tasks、compatibility matrix
- [x] 测试配置排除 build 重复执行
- [x] 修复 workflow 工具集缺少 Memory 工具的问题
- [x] 建立 Delegated Plan Contract v2 类型与校验骨架

## R1 Tool Registry

- [ ] 定义统一 `ToolDefinition`
- [ ] 将 Schema、Annotation、Toolset、Handler 汇入 Registry
- [ ] 从 Registry 生成 tools/list
- [ ] 从 Registry 生成 dispatcher
- [ ] 从 Registry 生成 tools-manifest
- [ ] 从 Registry 生成 Skill 路由数据
- [ ] 保留现有工具输入输出快照

## R2 Server 解耦

- [ ] 提取 `createProbeServerCore`
- [ ] 提取 tool dispatcher
- [ ] 提取 bootstrap decorator
- [ ] 提取 graph resource runtime
- [ ] 提取 app resource runtime
- [ ] 将 `src/index.ts` 收敛为启动入口

## R3 Plan Contract 迁移

- [x] `start_feature` 接入 Contract v2
- [x] `start_bugfix` 接入 Contract v2
- [ ] `start_ui` 接入 Contract v2
- [ ] `start_onboard` 接入 Contract v2
- [ ] `start_product` 接入 Contract v2
- [ ] `start_ralph` 接入 Contract v2
- [x] 保留 v3 `mode + steps` 兼容测试
- [ ] 增加 Plan Heartbeat
- [ ] 增加轻量 resume_plan

## R4 Memory 2.0

- [ ] 区分 Project Knowledge 与 Shared Experience
- [ ] 增加 failed_approach、false_root_cause、regression_case 类型
- [ ] 增加适用范围、证据、置信度和失效字段
- [ ] 分阶段检索，避免一次性注入过量上下文
- [ ] Converge 通过后再写入正式记忆
- [ ] Memory 不可用降级测试

## R5 SDK v2 与双协议

- [ ] 建立 protocol capability model
- [ ] 升级拆分 SDK 包
- [ ] 实现 Legacy Adapter
- [ ] 实现 Modern Adapter
- [ ] stdio 双协议协商
- [ ] HTTP 双协议端点
- [ ] `MCP_PROTOCOL_MODE=auto|legacy|modern`
- [ ] Legacy/Modern reference client 测试

## R6 Input Required 与 Task Adapter

- [ ] Modern `input_required`
- [ ] Legacy interview/ask_user 降级
- [ ] Internal Task Runtime
- [ ] Legacy Task Adapter
- [ ] Modern Task Adapter
- [ ] Synchronous Fallback
- [ ] Progress 竞态与取消测试

## R7 收敛与评估

- [ ] 新增 `converge`
- [ ] 需求、Spec、代码、测试、Review 对齐检查
- [ ] 工具路由 eval
- [ ] Plan Compliance eval
- [ ] Memory relevance eval
- [ ] 客户端兼容矩阵

## R8 发布

- [ ] v3 → v4 迁移说明
- [ ] v3 维护分支策略
- [ ] Changelog
- [ ] npm package smoke test
- [ ] MCP Registry 验证
- [ ] v4.0.0 发布
