/**
 * 单元测试：add_feature 模板加载与校验
 */

import { describe, test, expect } from 'vitest';
import { addFeature } from '../add_feature.js';

describe('add_feature 模板系统', () => {
  test('默认 auto 会选择 guided（短描述）', async () => {
    const result = await addFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toMatch(/模板档位/);
    expect(result.content[0].text).toMatch(/guided/);
    expect(result.content[0].text).toMatch(/模板校验结果/);

    const meta = (result as any)._meta?.template;
    expect(meta?.requested).toBe('auto');
    expect(meta?.profile).toBe('guided');
  });

  test('返回模板驱动指南与校验元数据', async () => {
    const result = await addFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      template_profile: 'strict',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toMatch(/模板档位/);
    expect(result.content[0].text).toMatch(/strict/);
    expect(result.content[0].text).toMatch(/requirements\.md/);
    expect(result.content[0].text).not.toMatch(/\{feature_name\}/);
    expect(result.content[0].text).not.toMatch(/填写规则/);

    const meta = (result as any)._meta?.template;
    expect(meta?.profile).toBe('strict');
    expect(meta?.validation?.requirements).toBeTruthy();
    expect(meta?.validation?.design).toBeTruthy();
    expect(meta?.validation?.tasks).toBeTruthy();
  });

  test('auto 在结构化描述时选择 strict', async () => {
    const result = await addFeature({
      description: `登录与鉴权功能\n\n## 需求\n- 支持邮箱登录\n- 支持第三方登录\n\n## 验收\n1. WHEN 用户提交正确凭证 THEN 系统 SHALL 登录成功\n2. IF 凭证错误 THEN 系统 SHALL 返回错误提示\n\n## 接口\nPOST /api/login`,
    });

    expect(result.isError).toBe(false);
    const meta = (result as any)._meta?.template;
    expect(meta?.requested).toBe('auto');
    expect(meta?.profile).toBe('strict');
  });
});
