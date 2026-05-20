import type { MemorySearchResult } from './memory-client.js';
import { createMemoryClient } from './memory-client.js';

export interface MemoryInjectionContext {
  enabled: boolean;
  available: boolean;
  degraded: boolean;
  query: string;
  results: MemorySearchResult[];
  error?: string;
}

export async function loadMemoryInjectionContext(query: string): Promise<MemoryInjectionContext> {
  const client = createMemoryClient();
  if (!client.isEnabled()) {
    return {
      enabled: false,
      available: false,
      degraded: false,
      query,
      results: [],
    };
  }

  try {
    const results = await client.search(query);
    return {
      enabled: true,
      available: true,
      degraded: false,
      query,
      results,
    };
  } catch (error) {
    return {
      enabled: true,
      available: false,
      degraded: true,
      query,
      results: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function renderMemoryGuideSection(context: MemoryInjectionContext): string {
  if (!context.enabled) {
    return '';
  }

  if (!context.available) {
    return `\n\n## 🧠 记忆系统\n- 状态: 已配置但本次检索降级\n- 原因: ${context.error || '未知错误'}\n- 处理: 忽略记忆注入，继续主流程\n`;
  }

  if (context.results.length === 0) {
    return `\n\n## 🧠 记忆系统\n- 状态: 已启用\n- 检索结果: 未找到高相关历史资产\n- 处理: 继续主流程；若本次产出存在高价值通用资产，结束后调用 \`memorize_asset\` 沉淀\n`;
  }

  const items = context.results
    .map((item, index) => `${index + 1}. ${item.name} [${item.type}] score=${item.score.toFixed(3)}\n   - 摘要: ${item.summary}\n   - 读取: read_memory_asset {\"asset_id\": \"${item.id}\"}${item.sourcePath ? `\n   - 来源: ${item.sourcePath}` : ''}`)
    .join('\n');

  return `\n\n## 🧠 记忆系统\n- 状态: 已启用\n- 指令: 优先复用以下历史成功经验；如果某条相关，再用 \`read_memory_asset\` 拉取完整内容，不要直接重写\n- 检索结果:\n${items}\n`;
}

export function buildMemoryPlanStep() {
  return {
    id: 'memorize',
    tool: 'memorize_asset',
    when: '本次实现完成且确认存在可复用资产',
    args: {
      name: '[资产名称]',
      type: 'code',
      description: '[该资产解决了什么问题]',
      summary: '[用于后续检索的简洁摘要]',
      content: '[可复用代码或规范内容]',
      usage: '[适用场景与限制]',
      confidence: 0.7,
    },
    outputs: [],
  };
}