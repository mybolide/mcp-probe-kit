import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import type { ConflictResolution } from "../schemas/output/project-tools.js";

// resolve_conflict 工具实现
export async function resolveConflict(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      conflicts?: string;
    }>(args, {
      defaultValues: {
        conflicts: "",
      },
      primaryField: "conflicts", // 纯文本输入默认映射到 conflicts 字段
      fieldAliases: {
        conflicts: ["conflict", "diff", "merge", "冲突", "合并冲突"],
      },
    });
    
    const conflicts = getString(parsedArgs.conflicts);

    const header = renderGuidanceHeader({
      tool: "resolve_conflict",
      goal: "输出可执行的冲突解决方案。",
      tasks: ["分析冲突并给出合并方案", "仅输出解决方案与合并后代码"],
      outputs: ["结构化冲突解决报告（JSON）"],
    });

    const message = `${header}请分析并解决以下 Git 冲突：

⚔️ **冲突内容**：
${conflicts || "请提供 git diff 或冲突文件内容"}

---

## Git 冲突解决流程

### 第一步：识别冲突

执行以下命令查看冲突：
\`\`\`bash
# 查看冲突文件列表
git status

# 查看具体冲突
git diff

# 或查看单个文件冲突
git diff --ours --theirs filename
\`\`\`

### 第二步：理解冲突标记

**冲突格式：**
\`\`\`
<<<<<<< HEAD (当前分支)
你的修改
=======
他人的修改
>>>>>>> branch-name (合并的分支)
\`\`\`

**示例冲突：**
\`\`\`javascript
function calculateTotal(items) {
<<<<<<< HEAD
  // 你的修改：添加了折扣
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  return subtotal * 0.9; // 10% 折扣
=======
  // 他人的修改：添加了税费
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return subtotal * 1.1; // 10% 税费
>>>>>>> feature/add-tax
}
\`\`\`

---

## 冲突分析

### 🔍 冲突类型识别

**1️⃣ 简单冲突（二选一）**
- 两个分支修改了同一行
- 通常选择其中一个版本

**2️⃣ 复杂冲突（需要合并）**
- 两个分支都添加了有用的功能
- 需要整合双方的修改

**3️⃣ 语义冲突**
- 语法上没冲突，但逻辑上不兼容
- 需要重新设计

**4️⃣ 结构冲突**
- 文件被移动或删除
- 需要决定文件的最终状态

---

## 解决策略

### 策略 1：保留当前分支（ours）
\`\`\`bash
git checkout --ours filename
git add filename
\`\`\`

### 策略 2：保留对方分支（theirs）
\`\`\`bash
git checkout --theirs filename
git add filename
\`\`\`

### 策略 3：手动合并（推荐）

**步骤：**
1. 分析双方的修改意图
2. 整合有价值的修改
3. 删除冲突标记
4. 测试合并后的代码

**合并示例：**
\`\`\`javascript
// 原始冲突
function calculateTotal(items) {
<<<<<<< HEAD
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  return subtotal * 0.9; // 10% 折扣
=======
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return subtotal * 1.1; // 10% 税费
>>>>>>> feature/add-tax
}

// ✅ 合并后（整合双方修改）
function calculateTotal(items, { discount = 0, taxRate = 0.1 } = {}) {
  // 整合了数量计算（theirs）和参数化设计（改进）
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const afterDiscount = subtotal * (1 - discount);
  return afterDiscount * (1 + taxRate);
}
\`\`\`

---

## 常见冲突场景

### 场景 1：Import 语句冲突
\`\`\`typescript
<<<<<<< HEAD
import { Button, Input } from './components';
import { api } from './services';
=======
import { Button, Select } from './components';
import { fetchData } from './utils';
>>>>>>> feature/add-select

// ✅ 合并后
import { Button, Input, Select } from './components';
import { api } from './services';
import { fetchData } from './utils';
\`\`\`

### 场景 2：配置文件冲突
\`\`\`json
<<<<<<< HEAD
{
  "name": "my-app",
  "version": "1.2.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
=======
{
  "name": "my-app",
  "version": "1.1.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "jest"
  }
}
>>>>>>> feature/add-tests

// ✅ 合并后（保留最新版本号和所有脚本）
{
  "name": "my-app",
  "version": "1.2.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "jest"
  }
}
\`\`\`

### 场景 3：函数重构冲突
\`\`\`typescript
<<<<<<< HEAD
// 你将同步改为异步
async function getUserData(id) {
  const response = await fetch(\`/api/users/\${id}\`);
  return response.json();
}
=======
// 他人添加了缓存
function getUserData(id) {
  if (cache.has(id)) {
    return cache.get(id);
  }
  const data = fetchUser(id);
  cache.set(id, data);
  return data;
}
>>>>>>> feature/add-cache

// ✅ 合并后（异步 + 缓存）
async function getUserData(id) {
  if (cache.has(id)) {
    return cache.get(id);
  }
  const response = await fetch(\`/api/users/\${id}\`);
  const data = await response.json();
  cache.set(id, data);
  return data;
}
\`\`\`

---

## 解决步骤

### Step 1: 备份
\`\`\`bash
# 创建备份分支
git branch backup-before-merge
\`\`\`

### Step 2: 分析冲突
\`\`\`bash
# 查看冲突统计
git diff --stat

# 使用可视化工具
git mergetool
\`\`\`

### Step 3: 解决冲突
1. 打开冲突文件
2. 分析双方修改
3. 手动合并代码
4. 删除冲突标记（<<<, ===, >>>）

### Step 4: 测试
\`\`\`bash
# 运行测试
npm test

# 运行 linter
npm run lint

# 构建检查
npm run build
\`\`\`

### Step 5: 提交
\`\`\`bash
# 标记冲突已解决
git add .

# 完成合并
git commit

# Git 会自动生成合并消息，或自定义：
git commit -m "chore: 解决 feature/xxx 合并冲突

- 整合了折扣和税费计算
- 保留了所有新增功能
- 所有测试通过"
\`\`\`

---

## 预防冲突

### 1️⃣ 频繁同步
\`\`\`bash
# 每天同步主分支
git fetch origin
git rebase origin/main
\`\`\`

### 2️⃣ 小步提交
- 提交粒度要小
- 功能尽量独立
- 避免大范围重构

### 3️⃣ 代码审查
- PR 及时 Review
- 避免长期未合并的分支

### 4️⃣ 使用工具
- VSCode Git Lens
- GitKraken
- Sourcetree

---

## 复杂冲突处理

### 使用 Git Rerere（重用已记录的解决方案）
\`\`\`bash
# 启用 rerere
git config --global rerere.enabled true

# Git 会记住你的冲突解决方式
# 下次遇到相同冲突时自动应用
\`\`\`

### 使用三路合并工具
\`\`\`bash
# 配置 VSCode 作为合并工具
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd 'code --wait $MERGED'

# 使用
git mergetool
\`\`\`

---

现在请分析冲突内容，提供：
1. 冲突原因分析
2. 双方修改意图
3. 推荐的合并方案
4. 完整的解决后代码`;

    // 创建结构化数据对象
    const structuredData: ConflictResolution = {
      summary: "Git 冲突解决指南",
      conflicts: [],
      resolvedCode: "待分析冲突后生成",
      explanation: "请提供冲突内容以进行分析"
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/project-tools.js")).ConflictResolutionSchema,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    
    const errorData: ConflictResolution = {
      summary: "冲突解决失败",
      conflicts: [],
      resolvedCode: "",
      explanation: errorMessage
    };
    
    return okStructured(`❌ 冲突解决失败: ${errorMessage}`, errorData, {
      schema: (await import("../schemas/output/project-tools.js")).ConflictResolutionSchema,
    });
  }
}

