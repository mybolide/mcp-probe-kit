import { parseArgs, getString } from "../utils/parseArgs.js";

// fix 工具实现
export async function fix(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      type?: string;
    }>(args, {
      defaultValues: {
        code: "",
        type: "all",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "src", "代码", "content"],
        type: ["fix_type", "category", "类型", "修复类型"],
      },
    });
    
    const code = getString(parsedArgs.code);
    const type = getString(parsedArgs.type) || "all"; // lint, type, format, import, unused

    const message = `请自动修复以下代码问题：

📝 **代码内容**：
${code || "请提供需要修复的代码"}

🎯 **修复类型**：${type}

---

## 自动修复步骤

### 第一步：识别问题

执行以下检查：
\`\`\`bash
# Lint 检查
npm run lint

# TypeScript 类型检查
tsc --noEmit

# 格式化检查
npm run format:check
\`\`\`

### 第二步：问题分类

**1️⃣ Lint 错误**
- ESLint 规则违反
- 代码质量问题
- 潜在 Bug

**2️⃣ TypeScript 类型错误**
- 类型不匹配
- 缺少类型定义
- 隐式 any

**3️⃣ 格式化问题**
- 缩进不一致
- 引号风格
- 分号使用
- 换行规则

**4️⃣ Import 问题**
- 未使用的 import
- 重复 import
- Import 顺序混乱
- 相对路径 vs 绝对路径

**5️⃣ 未使用代码**
- 未使用的变量
- 未使用的函数
- 死代码（Dead Code）

---

## 修复策略

### 🔧 Lint 错误修复

**常见问题和修复：**

1. **no-unused-vars**
\`\`\`typescript
// ❌ Before
const unusedVar = 123;
function test() {
  const result = compute();
  return 42;
}

// ✅ After
function test() {
  return 42;
}
\`\`\`

2. **no-console**
\`\`\`typescript
// ❌ Before
console.log('debug info');

// ✅ After (开发环境)
if (process.env.NODE_ENV === 'development') {
  console.log('debug info');
}

// ✅ After (使用 logger)
logger.debug('debug info');
\`\`\`

3. **prefer-const**
\`\`\`typescript
// ❌ Before
let value = 10;
const result = value * 2;

// ✅ After
const value = 10;
const result = value * 2;
\`\`\`

### 🔧 TypeScript 类型错误修复

**常见问题和修复：**

1. **隐式 any**
\`\`\`typescript
// ❌ Before
function process(data) {
  return data.value;
}

// ✅ After
function process(data: { value: string }): string {
  return data.value;
}
\`\`\`

2. **类型不匹配**
\`\`\`typescript
// ❌ Before
const num: number = "123";

// ✅ After
const num: number = 123;
// 或
const num: number = parseInt("123");
\`\`\`

3. **可能为 null/undefined**
\`\`\`typescript
// ❌ Before
function getName(user) {
  return user.name.toUpperCase();
}

// ✅ After
function getName(user: User | null): string {
  return user?.name?.toUpperCase() ?? 'Unknown';
}
\`\`\`

### 🔧 Import 优化

**修复策略：**

\`\`\`typescript
// ❌ Before
import { useState, useEffect, useMemo } from 'react';
import { Button } from './components/Button';
import React from 'react';
import { formatDate } from '../utils/date';
import { api } from '../../services/api';

// ✅ After
// 外部依赖
import React, { useEffect, useMemo, useState } from 'react';

// 内部模块（按层级从远到近）
import { api } from '../../services/api';
import { formatDate } from '../utils/date';
import { Button } from './components/Button';
\`\`\`

### 🔧 格式化修复

**自动格式化：**
\`\`\`bash
# Prettier
npm run format

# ESLint 自动修复
npm run lint:fix
\`\`\`

---

## 批量修复命令

**一键修复所有可自动修复的问题：**
\`\`\`bash
# 1. 格式化代码
npm run format

# 2. ESLint 自动修复
npm run lint:fix

# 3. 整理 import
npx organize-imports-cli 'src/**/*.ts'

# 4. 移除未使用的 import
npx ts-unused-exports tsconfig.json --deleteUnusedFile

# 5. TypeScript 类型检查
tsc --noEmit
\`\`\`

---

## 修复报告

### 📊 问题统计
- Lint 错误: X 个
- 类型错误: Y 个
- 格式问题: Z 个
- Import 问题: W 个

### ✅ 已自动修复
1. [文件:行号] 问题描述 → 已修复
2. [文件:行号] 问题描述 → 已修复

### ⚠️ 需要手动处理
1. [文件:行号] 问题描述 → 修复建议
2. [文件:行号] 问题描述 → 修复建议

### 📝 修复后的代码
\`\`\`typescript
// 完整的修复后代码
\`\`\`

---

## 预防措施

**配置自动修复：**

\`\`\`.vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "eslint.validate": [
    "javascript",
    "typescript",
    "javascriptreact",
    "typescriptreact"
  ]
}
\`\`\`

**Git Hooks（Husky）：**
\`\`\`json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{js,ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
\`\`\`

---

现在请开始分析代码问题并自动修复。`;

    return {
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ 自动修复失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

