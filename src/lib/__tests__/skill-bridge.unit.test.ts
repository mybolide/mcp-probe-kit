import { describe, expect, it } from 'vitest';
import {
  buildSkillBridgePlanStep,
  renderSkillBridgeSection,
  type SkillBridgeStatus,
} from '../skill-bridge.js';

function status(workflow: 'start_ui' | 'start_product'): SkillBridgeStatus {
  return {
    workflow,
    generatedAt: '2026-08-01T00:00:00.000Z',
    installedCount: 3,
    missingCount: 0,
    ready: true,
    skills: [
      { name: 'interaction-design', role: 'interaction', installed: true, expectedPaths: [] },
      { name: 'frontend-design', role: 'frontend', installed: true, expectedPaths: [] },
      { name: 'ui-ux-pro-max', role: 'reference only', installed: true, expectedPaths: [] },
    ],
  };
}

describe('skill-bridge authority boundary', () => {
  it('start_ui 明确视觉方向契约优先于外部 Skill', () => {
    const step = buildSkillBridgePlanStep(status('start_ui'));
    const text = JSON.stringify(step);

    expect(step.when).toContain('主契约生成后');
    expect(text).toContain('视觉方向契约已经锁定');
    expect(text).toContain('禁止重新选择视觉风格');
    expect(text).toContain('冲突的风格标签或主题推荐均已丢弃');
  });

  it('渲染说明明确 Skill 只能做受控增强', () => {
    const section = renderSkillBridgeSection(status('start_ui'));

    expect(section).toContain('Skill Bridge（受控增强）');
    expect(section).toContain('禁止覆盖视觉方向、密度、配色、字体、禁用项和验收分数');
    expect(section.indexOf('interaction-design')).toBeLessThan(section.indexOf('ui-ux-pro-max'));
  });
});
