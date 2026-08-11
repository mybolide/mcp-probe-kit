/**
 * Infer the sub-mode only after the Agent has already selected the
 * architecture workflow. This is intentionally narrow and is not a general
 * task/intent classifier.
 */
export function inferArchitectureMode(
  intent: string,
): 'assess' | 'design' | 'validate' | 'drift' {
  if (/漂移|偏离|drift/i.test(intent)) return 'drift';
  if (/验证|校验|核验|符合目标架构|validate/i.test(intent)) return 'validate';

  const explicitlyAssessOnly = /(?:只|仅)(?:需|要|做|进行)?(?:评估|审查|检查)|(?:不要|无需|不需要|不做|不进行).{0,12}(?:重新)?(?:设计|改造|迁移|拆分)|(?:assess|evaluate|review).{0,24}(?:only|without)|(?:do not|don't|without).{0,16}(?:re)?design/i.test(intent);
  if (explicitlyAssessOnly) return 'assess';

  const positiveIntent = intent
    .replace(/(?:不要|无需|不需要|不做|不进行).{0,12}(?:重新)?(?:设计|改造|迁移|拆分)/gi, ' ')
    .replace(/(?:do not|don't|without).{0,16}(?:re)?design/gi, ' ');
  if (/设计|规划|迁移|收口|重新拆分|design|migrate/i.test(positiveIntent)) return 'design';
  return 'assess';
}
