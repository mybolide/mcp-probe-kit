# 如何编写测试

> 本文档描述 MCP Probe Kit 的测试框架和测试编写规范。

## 概述

MCP Probe Kit 使用 **Vitest** 作为测试框架，支持单元测试、集成测试和属性测试（Property-based Testing）。

## 测试框架

### 核心工具

| 工具 | 版本 | 用途 |
|------|------|------|
| Vitest | 4.0.18 | 测试框架（类似 Jest） |
| @vitest/ui | 4.0.18 | 测试 UI 界面 |
| fast-check | 4.5.3 | 属性测试库 |

### 测试命令

```bash
# 运行所有测试（单次）
npm test

# 监听模式（自动重新运行）
npm run test:watch

# 启动测试 UI 界面
npm run test:ui
```

## 测试文件组织

```
src/
├── tools/
│   ├── __tests__/           # 工具测试目录
│   │   ├── add_feature.test.ts
│   │   └── estimate.test.ts
│   ├── add_feature.ts
│   └── estimate.ts
└── utils/
    ├── __tests__/           # 工具函数测试目录
    │   ├── bm25.test.ts
    │   └── parseArgs.test.ts
    ├── bm25.ts
    └── parseArgs.ts
```

**命名规范：**
- 测试文件名：`*.test.ts` 或 `*.spec.ts`
- 测试目录：`__tests__/`

## 编写单元测试

### 基本结构

```typescript
import { describe, it, expect } from 'vitest';
import { functionToTest } from '../module.js';

describe('模块名称', () => {
  it('应该做某事', () => {
    // Arrange - 准备测试数据
    const input = 'test';
    
    // Act - 执行被测试的函数
    const result = functionToTest(input);
    
    // Assert - 验证结果
    expect(result).toBe('expected');
  });
});
```

### 实际示例 - 测试参数解析

**被测试代码** (`src/utils/parseArgs.ts`):

```typescript
export function parseArgs(input: string): Record<string, any> {
  const args: Record<string, any> = {};
  const regex = /--(\w+)(?:=(\S+))?/g;
  let match;
  
  while ((match = regex.exec(input)) !== null) {
    const key = match[1];
    const value = match[2] || true;
    args[key] = value;
  }
  
  return args;
}
```

**测试代码** (`src/utils/__tests__/parseArgs.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import { parseArgs } from '../parseArgs.js';

describe('parseArgs', () => {
  it('应该解析带值的参数', () => {
    const result = parseArgs('--name=test --age=25');
    expect(result).toEqual({
      name: 'test',
      age: '25',
    });
  });

  it('应该解析布尔标志', () => {
    const result = parseArgs('--verbose --debug');
    expect(result).toEqual({
      verbose: true,
      debug: true,
    });
  });

  it('应该处理空字符串', () => {
    const result = parseArgs('');
    expect(result).toEqual({});
  });

  it('应该处理混合参数', () => {
    const result = parseArgs('--mode=auto --force --output=file.txt');
    expect(result).toEqual({
      mode: 'auto',
      force: true,
      output: 'file.txt',
    });
  });
});
```

## 测试异步函数

### 使用 async/await

```typescript
import { describe, it, expect } from 'vitest';
import { asyncFunction } from '../module.js';

describe('异步函数测试', () => {
  it('应该返回正确的结果', async () => {
    const result = await asyncFunction('input');
    expect(result).toBe('expected');
  });

  it('应该处理错误', async () => {
    await expect(asyncFunction('invalid')).rejects.toThrow('错误信息');
  });
});
```

### 实际示例 - 测试工具函数

```typescript
import { describe, it, expect } from 'vitest';
import { gitWorkReport } from '../git_work_report.js';

describe('gitWorkReport', () => {
  it('应该在无提交时返回提示', async () => {
    const result = await gitWorkReport({ date: '2020-01-01' });
    
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('当日无代码提交');
  });

  it('应该验证必需参数', async () => {
    const result = await gitWorkReport({});
    
    expect(result.content[0].text).toContain('请提供');
  });

  it('应该支持日期范围', async () => {
    const result = await gitWorkReport({
      start_date: '2026-02-01',
      end_date: '2026-02-06',
    });
    
    expect(result.content).toBeDefined();
  });
});
```

## Mock 和 Stub

### 使用 vi.mock

```typescript
import { describe, it, expect, vi } from 'vitest';
import { exec } from 'child_process';

// Mock child_process 模块
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

describe('使用 Mock 的测试', () => {
  it('应该调用 exec', async () => {
    const mockExec = exec as any;
    mockExec.mockImplementation((cmd: string, callback: Function) => {
      callback(null, { stdout: 'output', stderr: '' });
    });

    // 测试代码...
    
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining('git log'),
      expect.any(Function)
    );
  });
});
```

## 属性测试（Property-based Testing）

使用 `fast-check` 进行属性测试，验证函数在各种输入下的行为。

### 实际示例 - 测试 BM25 搜索

**被测试代码** (`src/utils/bm25.ts`):

```typescript
export function bm25Search(
  query: string,
  documents: string[],
  k1 = 1.5,
  b = 0.75
): number[] {
  // BM25 算法实现
  // 返回每个文档的相关性分数
}
```

**属性测试** (`src/utils/__tests__/bm25.test.ts`):

```typescript
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { bm25Search } from '../bm25.js';

describe('bm25Search - 属性测试', () => {
  it('应该返回与文档数量相同的分数数组', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.string(), { minLength: 1, maxLength: 100 }),
        (query, documents) => {
          const scores = bm25Search(query, documents);
          expect(scores.length).toBe(documents.length);
        }
      )
    );
  });

  it('分数应该都是非负数', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.string(), { minLength: 1 }),
        (query, documents) => {
          const scores = bm25Search(query, documents);
          expect(scores.every(score => score >= 0)).toBe(true);
        }
      )
    );
  });

  it('空查询应该返回全零分数', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1 }),
        (documents) => {
          const scores = bm25Search('', documents);
          expect(scores.every(score => score === 0)).toBe(true);
        }
      )
    );
  });
});
```

## 测试覆盖率

### 查看覆盖率

```bash
# 运行测试并生成覆盖率报告
npm test -- --coverage

# 在浏览器中查看详细报告
# 报告位于 coverage/index.html
```

### 覆盖率目标

- **语句覆盖率**: > 80%
- **分支覆盖率**: > 75%
- **函数覆盖率**: > 80%
- **行覆盖率**: > 80%

## 测试最佳实践

### 1. 测试命名

使用清晰的描述性名称：

```typescript
// ✅ 好的命名
it('应该在日期无效时抛出错误', () => {});
it('应该返回包含 3 个元素的数组', () => {});

// ❌ 不好的命名
it('测试1', () => {});
it('works', () => {});
```

### 2. 一个测试一个断言

```typescript
// ✅ 好的做法
it('应该返回正确的名称', () => {
  expect(result.name).toBe('test');
});

it('应该返回正确的年龄', () => {
  expect(result.age).toBe(25);
});

// ❌ 不好的做法
it('应该返回正确的结果', () => {
  expect(result.name).toBe('test');
  expect(result.age).toBe(25);
  expect(result.email).toBe('test@example.com');
});
```

### 3. 使用 describe 分组

```typescript
describe('gitWorkReport', () => {
  describe('日报模式', () => {
    it('应该接受单个日期', () => {});
    it('应该在无提交时返回提示', () => {});
  });

  describe('周期报模式', () => {
    it('应该接受日期范围', () => {});
    it('应该验证结束日期晚于开始日期', () => {});
  });

  describe('参数验证', () => {
    it('应该要求至少一个日期参数', () => {});
    it('应该验证日期格式', () => {});
  });
});
```

### 4. 测试边界条件

```typescript
describe('边界条件测试', () => {
  it('应该处理空数组', () => {});
  it('应该处理单个元素', () => {});
  it('应该处理大量元素', () => {});
  it('应该处理 null 值', () => {});
  it('应该处理 undefined 值', () => {});
});
```

### 5. 避免测试实现细节

```typescript
// ✅ 测试行为
it('应该返回排序后的数组', () => {
  const result = sortArray([3, 1, 2]);
  expect(result).toEqual([1, 2, 3]);
});

// ❌ 测试实现
it('应该调用 Array.sort', () => {
  const spy = vi.spyOn(Array.prototype, 'sort');
  sortArray([3, 1, 2]);
  expect(spy).toHaveBeenCalled();
});
```

## 常用断言

```typescript
// 相等性
expect(value).toBe(expected);           // 严格相等 (===)
expect(value).toEqual(expected);        // 深度相等
expect(value).not.toBe(expected);       // 不相等

// 真值
expect(value).toBeTruthy();             // 真值
expect(value).toBeFalsy();              // 假值
expect(value).toBeNull();               // null
expect(value).toBeUndefined();          // undefined
expect(value).toBeDefined();            // 已定义

// 数字
expect(value).toBeGreaterThan(3);       // > 3
expect(value).toBeGreaterThanOrEqual(3);// >= 3
expect(value).toBeLessThan(5);          // < 5
expect(value).toBeCloseTo(0.3);         // 浮点数近似

// 字符串
expect(string).toMatch(/pattern/);      // 正则匹配
expect(string).toContain('substring');  // 包含子串

// 数组
expect(array).toContain(item);          // 包含元素
expect(array).toHaveLength(3);          // 长度为 3

// 对象
expect(object).toHaveProperty('key');   // 有属性
expect(object).toMatchObject({ a: 1 }); // 部分匹配

// 异常
expect(() => fn()).toThrow();           // 抛出异常
expect(() => fn()).toThrow('error');    // 抛出特定消息
```

## 调试测试

### 使用 console.log

```typescript
it('调试测试', () => {
  const result = functionToTest();
  console.log('Result:', result);  // 输出到控制台
  expect(result).toBe('expected');
});
```

### 使用 .only 运行单个测试

```typescript
it.only('只运行这个测试', () => {
  // 只有这个测试会运行
});
```

### 使用 .skip 跳过测试

```typescript
it.skip('暂时跳过这个测试', () => {
  // 这个测试会被跳过
});
```

---
*返回索引: [../project-context.md](../project-context.md)*
