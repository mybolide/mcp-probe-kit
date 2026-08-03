import type { UISearchResult } from './ui-search-engine.js';

const DISCOURAGED_STYLE_PATTERN =
  /\b(?:glassmorphism|neumorphism|claymorphism)\b|玻璃拟态|新拟态|黏土拟态|粘土拟态/i;

export interface UISearchStylePolicyResult {
  results: UISearchResult[];
  explicitStyleRequest: boolean;
  filteredCount: number;
  advisory?: string;
}

function resultSearchText(result: UISearchResult): string {
  return `${result.category}\n${JSON.stringify(result.data)}`;
}

export function explicitlyRequestsDiscouragedStyle(query: string): boolean {
  return DISCOURAGED_STYLE_PATTERN.test(query);
}

export function applyUiSearchStylePolicy(
  query: string,
  results: UISearchResult[],
  limit: number,
): UISearchStylePolicyResult {
  const explicitStyleRequest = explicitlyRequestsDiscouragedStyle(query);
  const boundedLimit = Math.max(1, Math.trunc(limit));

  if (explicitStyleRequest) {
    return {
      results: results.slice(0, boundedLimit),
      explicitStyleRequest: true,
      filteredCount: 0,
      advisory:
        '该查询明确要求高风险拟态风格。结果仅作为参考；落地前必须验证对比度、可读性、焦点状态、错误状态和低性能设备表现，不得作为默认生产方向。',
    };
  }

  const filtered = results.filter((result) => !DISCOURAGED_STYLE_PATTERN.test(resultSearchText(result)));
  return {
    results: filtered.slice(0, boundedLimit),
    explicitStyleRequest: false,
    filteredCount: results.length - filtered.length,
    advisory: results.length !== filtered.length
      ? '已过滤与默认生产设计约束冲突的高风险拟态风格结果。'
      : undefined,
  };
}
