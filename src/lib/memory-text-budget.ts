export interface MemoryTextBudgetResult {
  text: string;
  truncated: boolean;
  originalChars: number;
  renderedChars: number;
}

export function applyMemoryTextBudget(
  value: string,
  maxChars: number,
  notice = '\n\n[Memory 文本已按总字符预算截断；完整内容请用 read_memory_asset 读取]'
): MemoryTextBudgetResult {
  const normalizedLimit = Math.max(200, Math.floor(maxChars));
  if (value.length <= normalizedLimit) {
    return {
      text: value,
      truncated: false,
      originalChars: value.length,
      renderedChars: value.length,
    };
  }

  const safeNotice = notice.length >= normalizedLimit
    ? notice.slice(0, Math.max(0, normalizedLimit - 3)) + '...'
    : notice;
  const bodyLimit = Math.max(0, normalizedLimit - safeNotice.length);
  const body = trimAtLineBoundary(value, bodyLimit);
  const text = `${body}${safeNotice}`;
  return {
    text,
    truncated: true,
    originalChars: value.length,
    renderedChars: text.length,
  };
}

function trimAtLineBoundary(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 0) return '';
  const slice = value.slice(0, maxChars);
  const lastNewline = slice.lastIndexOf('\n');
  if (lastNewline >= Math.floor(maxChars * 0.7)) {
    return slice.slice(0, lastNewline).trimEnd();
  }
  return slice.trimEnd();
}
