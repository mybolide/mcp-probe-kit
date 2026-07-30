# 子任务：SDK v2 与双协议兼容

- [ ] 1.1 建立 protocol capability model 与双协议入口 — _需求: FR-4_
  - 证据块：Legacy 和 Modern reference client 均可完成 tools/list、tools/call、resources/read。
  - 涉及文件：`src/protocol/`、stdio/HTTP 启动入口。
- [ ] 1.2 升级 SDK v2 并实现 Legacy / Modern Adapter — _需求: FR-4_
  - 证据块：旧工具输入输出快照无破坏，双协议集成测试通过。
  - 涉及文件：`package.json`、协议适配层、Server factory。
- [ ] 2.1 实现能力级降级与客户端兼容矩阵 — _需求: FR-5_
  - 证据块：input_required、Apps、Progress、Resources、Tasks 各缺失场景均有自动化测试。
  - 涉及文件：capability resolver、兼容测试与 `compatibility-matrix.md`。
