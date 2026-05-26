import type { MemorySearchResult } from './memory-client.js';
import { createMemoryClient } from './memory-client.js';

export type MemoryPlanKind = 'feature' | 'bugfix' | 'ui' | 'default';

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

function formatMemoryResultLabel(item: MemorySearchResult): string {
  const kind =
    item.type === 'bugfix' || item.tags.includes('bugfix')
      ? '历史 Bug 修复'
      : item.type === 'pattern' || item.type === 'component'
        ? '可复用模式'
        : '历史资产';
  return `${item.name} [${item.type}] (${kind})`;
}

export function renderMemoryGuideSection(context: MemoryInjectionContext): string {
  if (!context.enabled) {
    return '';
  }

  if (!context.available) {
    return `\n\n## 🧠 记忆系统\n- 状态: 已配置但本次检索降级\n- 原因: ${context.error || '未知错误'}\n- 处理: 忽略记忆注入，继续主流程\n`;
  }

  if (context.results.length === 0) {
    return `\n\n## 🧠 记忆系统\n- 状态: 已启用\n- 检索结果: 未找到高相关记录（含历史 Bug 修复与可复用模式）\n- 处理: 继续主流程；Bug 修复验证通过后必须 \`memorize_asset\` 沉淀；功能/UI 有可复用产出再沉淀\n`;
  }

  const items = context.results
    .map((item, index) => {
      const label = formatMemoryResultLabel(item);
      return `${index + 1}. ${label} score=${item.score.toFixed(3)}\n   - 摘要: ${item.summary}\n   - 读取: read_memory_asset {\"asset_id\": \"${item.id}\"}${item.sourcePath ? `\n   - 来源: ${item.sourcePath}` : ''}`;
    })
    .join('\n');

  return `\n\n## 🧠 记忆系统\n- 状态: 已启用\n- 指令: 开干前先复用下列记录（含历史 Bug 现象/根因/改法）；相关条目用 \`read_memory_asset\` 读全文，避免重复踩坑\n- 检索结果:\n${items}\n`;
}

export function buildMemoryPlanStep(kind: MemoryPlanKind = 'default') {
  if (kind === 'bugfix') {
    return {
      id: 'memorize-bugfix',
      tool: 'memorize_asset',
      when: 'Bug 已修复且验证通过后（必须沉淀，便于下次同类问题检索）',
      args: {
        name: '[问题简述，如 登录超时-Redis连接池]',
        type: 'bugfix',
        description: '[现象、报错信息、复现条件]',
        summary: '[检索用：关键词 + 根因 + 修复要点，一句话]',
        content:
          '【现象】...\n【根因】...\n【修复】具体改动文件与关键代码/配置\n【验证】如何确认已修好',
        usage: '[再次遇到何种症状时可参考]',
        tags: ['bugfix', 'root-cause'],
        confidence: 0.85,
      },
      outputs: [],
    };
  }

  if (kind === 'ui') {
    return {
      id: 'memorize-ui',
      tool: 'memorize_asset',
      when: 'UI 实现完成且存在可复用组件/布局/交互模式',
      args: {
        name: '[UI 资产名称]',
        type: 'component',
        description: '[该 UI 模式解决什么问题]',
        summary: '[检索用摘要]',
        content: '[组件结构、样式约定或可复用片段]',
        usage: '[适用页面/场景]',
        tags: ['ui', 'pattern'],
        confidence: 0.75,
      },
      outputs: [],
    };
  }

  if (kind === 'feature') {
    return {
      id: 'memorize-feature',
      tool: 'memorize_asset',
      when: '功能完成且存在可复用实现/规范',
      args: {
        name: '[功能/模式名称]',
        type: 'pattern',
        description: '[该资产解决什么问题]',
        summary: '[检索用摘要]',
        content: '[可复用代码或流程]',
        usage: '[适用场景与限制]',
        tags: ['feature', 'pattern'],
        confidence: 0.75,
      },
      outputs: [],
    };
  }

  return {
    id: 'memorize',
    tool: 'memorize_asset',
    when: '本次实现完成且确认存在可复用资产',
    args: {
      name: '[资产名称]',
      type: 'pattern',
      description: '[该资产解决了什么问题]',
      summary: '[用于后续检索的简洁摘要]',
      content: '[可复用代码或规范内容]',
      usage: '[适用场景与限制]',
      tags: ['pattern'],
      confidence: 0.7,
    },
    outputs: [],
  };
}
