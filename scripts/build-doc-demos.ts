import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MCP_APP_RESOURCES, buildMcpAppHtml } from '../src/lib/mcp-apps.js';

const outputDir = resolve(import.meta.dirname, '..', 'docs', 'demos');
await mkdir(outputDir, { recursive: true });

const demos = [
  {
    kind: 'devcontrol-workbench',
    file: 'devcontrol.html',
    demo: {
      enabled: true,
      projectRoot: '/example/application',
      tasks: [
        { id: 'F5-01', title: 'SQLite 任务审批与租约', status: 'verified', description: '代码、真实 Gate 和审核证据均已绑定正式任务' },
        { id: 'F5-02', title: '跨会话恢复与 History', status: 'in_progress', description: 'Agent 恢复任务合同并核对当前项目状态' },
        { id: 'F5-03', title: 'Bug 根因与回归验证', status: 'ready', description: '依赖经审核，等待符合范围的 claim' },
      ],
    },
  },
  {
    kind: 'memory-center',
    file: 'memory-center.html',
    demo: {
      enabled: true,
      memoryItems: [
        { id: 'memory-1', title: '独立代码审查与真实 Gate', summary: 'Agent 负责独立测试，不把 DevControl 的结构门禁当做语义审查结果' },
        { id: 'memory-2', title: '受控范围变更', summary: '冻结文件范围的任何新增都要独立审查和 Owner 的精确审批' },
      ],
    },
  },
] as const;

for (const demo of demos) {
  const resource = MCP_APP_RESOURCES.find((item) => item.kind === demo.kind);
  if (!resource) throw new Error(`Missing v5 MCP App: ${demo.kind}`);
  await writeFile(resolve(outputDir, demo.file), buildMcpAppHtml(resource, {
    demo: demo.demo,
  }), 'utf8');
}
console.log(`[build-doc-demos] wrote ${demos.length} SQLite-only v5 demos to ${outputDir}`);
