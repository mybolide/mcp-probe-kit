export const SRC8_METHODOLOGY = 'src8' as const;
/** @deprecated 使用 src8；保留兼容旧调用方 */
export const TBP8_ALIAS = 'tbp8' as const;

export function resolveAnalysisMode(raw?: string): typeof SRC8_METHODOLOGY {
  const normalized = (raw || '').trim().toLowerCase();
  if (normalized === TBP8_ALIAS || normalized === SRC8_METHODOLOGY || !normalized) {
    return SRC8_METHODOLOGY;
  }
  return SRC8_METHODOLOGY;
}
