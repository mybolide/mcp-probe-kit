import { describe, test, expect } from 'vitest';
import { validateSpecDocuments, extractFrIds } from '../spec-validator.js';

const goodReq = `# 需求文档：demo

## 功能概述
做一个登录功能。

## 历史经验与坑（来自记忆库）
- 可复用经验: 无
- 必须规避的坑: 无

## 范围边界
In Scope: 登录
Out of Scope: 注册

## 需求列表
### FR-1: 登录
**优先级:** Must
**用户故事:** 作为用户，我想登录，以便访问系统。
#### 验收标准（EARS）
1. WHEN 提交正确凭证 THEN 系统 SHALL 登录成功

## 非功能需求
- NFR-1: 登录响应 < 1s

## 依赖关系
- 无
`;

const goodDesign = `# 设计文档：demo

## 概述
登录设计。
**对应需求:** FR-1

## 技术方案
### 技术选型
使用 JWT。

## 数据模型
不涉及。

## API 设计
POST /api/login

## 文件结构
src/login.ts

## 设计决策
决策 1：用 JWT。

## 风险评估
无。
`;

const goodTasks = `# 任务清单：demo

## 概述
任务分解。

## 任务列表
### 阶段 2: 核心实现
- [ ] 2.1 实现登录接口 — _需求: FR-1_ ｜ _设计: API 设计_

## 检查点
- [ ] 阶段 2 完成后：登录可用

## 需求覆盖矩阵
| 需求 ID | 设计章节 | 任务编号 | 状态 |
| FR-1 | API 设计 | 2.1 | 未开始 |

## 文件变更清单
| 文件 | 操作 | 说明 |
| src/login.ts | 新建 | 登录接口 |
`;

describe('spec-validator（P1 填写后校验）', () => {
  test('完整规格通过校验', () => {
    const r = validateSpecDocuments({ requirements: goodReq, design: goodDesign, tasks: goodTasks });
    expect(r.passed).toBe(true);
    expect(r.errorCount).toBe(0);
    expect(r.frIds).toContain('FR-1');
  });

  test('残留 [填写：] 占位 → 未通过', () => {
    const r = validateSpecDocuments({ requirements: goodReq + '\n- [填写：补充]', design: goodDesign, tasks: goodTasks });
    expect(r.passed).toBe(false);
    expect(r.issues.some((i) => i.file === 'requirements' && i.code === 'placeholder')).toBe(true);
  });

  test('缺少 design 文件 → 未通过', () => {
    const r = validateSpecDocuments({ requirements: goodReq, design: null, tasks: goodTasks });
    expect(r.passed).toBe(false);
    expect(r.issues.some((i) => i.file === 'design' && i.code === 'missing_file')).toBe(true);
  });

  test('无 EARS 验收标准 → 未通过', () => {
    const r = validateSpecDocuments({
      requirements: goodReq.replace('1. WHEN 提交正确凭证 THEN 系统 SHALL 登录成功', '1. 能登录'),
      design: goodDesign,
      tasks: goodTasks,
    });
    expect(r.passed).toBe(false);
    expect(r.issues.some((i) => i.code === 'no_acceptance')).toBe(true);
  });

  test('FR 未进 tasks 覆盖矩阵 → 跨文档未覆盖', () => {
    const reqTwoFr = goodReq.replace(
      '## 非功能需求',
      `### FR-2: 登出
**优先级:** Should
**用户故事:** 作为用户，我想登出。
#### 验收标准（EARS）
1. WHEN 点击登出 THEN 系统 SHALL 退出登录

## 非功能需求`
    );
    const r = validateSpecDocuments({ requirements: reqTwoFr, design: goodDesign, tasks: goodTasks });
    expect(r.passed).toBe(false);
    expect(r.issues.some((i) => i.code === 'uncovered_fr')).toBe(true);
  });

  test('extractFrIds 去重并保序', () => {
    expect(extractFrIds('FR-1 写了 FR-1 又写 FR-2')).toEqual(['FR-1', 'FR-2']);
  });
});
