// split 工具实现
export async function split(args: any) {
  try {
    const file = args?.file || "";
    const strategy = args?.strategy || "auto"; // auto, type, function, component, feature

    const message = `请拆分以下文件：

📝 **文件内容**：
${file || "请提供需要拆分的文件内容或路径"}

🎯 **拆分策略**：${strategy}

---

## 文件拆分指南

### 拆分策略

#### 1️⃣ 按类型拆分（type）
适用于工具类、常量、类型定义混在一起的文件。

**示例场景**：
\`\`\`typescript
// ❌ utils.ts (500 行)
export const API_URL = 'https://api.example.com';
export const MAX_RETRY = 3;

export interface User {
  id: string;
  name: string;
}

export function formatDate(date: Date): string { }
export function validateEmail(email: string): boolean { }
\`\`\`

**拆分后**：
\`\`\`
src/
├── constants/
│   └── api.ts          # API_URL, MAX_RETRY
├── types/
│   └── user.ts         # User interface
└── utils/
    ├── date.ts         # formatDate
    └── validation.ts   # validateEmail
\`\`\`

---

#### 2️⃣ 按功能拆分（function）
适用于一个文件包含多个独立函数。

**示例场景**：
\`\`\`typescript
// ❌ helpers.ts (800 行)
export function userHelpers() { }
export function orderHelpers() { }
export function paymentHelpers() { }
\`\`\`

**拆分后**：
\`\`\`
src/helpers/
├── user.ts       # 用户相关
├── order.ts      # 订单相关
└── payment.ts    # 支付相关
\`\`\`

---

#### 3️⃣ 按组件拆分（component）
适用于 React/Vue 组件过大，需要拆分为子组件。

**示例场景**：
\`\`\`tsx
// ❌ UserProfile.tsx (600 行)
export function UserProfile() {
  return (
    <div>
      {/* Header 100 行 */}
      {/* Sidebar 150 行 */}
      {/* Content 200 行 */}
      {/* Footer 150 行 */}
    </div>
  );
}
\`\`\`

**拆分后**：
\`\`\`
src/components/UserProfile/
├── index.tsx              # 主组件（组装）
├── UserProfileHeader.tsx
├── UserProfileSidebar.tsx
├── UserProfileContent.tsx
├── UserProfileFooter.tsx
└── styles.module.css
\`\`\`

---

#### 4️⃣ 按功能模块拆分（feature）
适用于功能模块混在一起的大文件。

**示例场景**：
\`\`\`typescript
// ❌ store.ts (1000 行)
// 用户模块 state, actions, reducers
// 订单模块 state, actions, reducers
// 购物车模块 state, actions, reducers
\`\`\`

**拆分后**：
\`\`\`
src/store/
├── index.ts          # 组装所有模块
├── user/
│   ├── state.ts
│   ├── actions.ts
│   └── reducers.ts
├── order/
│   ├── state.ts
│   ├── actions.ts
│   └── reducers.ts
└── cart/
    ├── state.ts
    ├── actions.ts
    └── reducers.ts
\`\`\`

---

#### 5️⃣ 自动分析拆分（auto）
AI 分析代码结构，自动选择最佳拆分策略。

---

## 拆分原则

### ✅ 应该拆分的信号

1. **文件行数过多**
   - 超过 300 行：考虑拆分
   - 超过 500 行：强烈建议拆分
   - 超过 1000 行：必须拆分

2. **职责过多**
   - 处理多个不相关的业务逻辑
   - 混合了类型定义、工具函数、组件

3. **难以维护**
   - 滚动半天找不到函数
   - 修改一个功能影响其他功能
   - Git 冲突频繁

4. **复用性差**
   - 只能整体导入，无法按需导入
   - 想复用某个函数，必须导入整个文件

### ⚠️ 不应该过度拆分

1. **避免碎片化**
   - 不要拆成几十个只有几行的文件
   - 保持相关代码的内聚性

2. **避免循环依赖**
   - 拆分后注意依赖关系
   - 使用依赖注入或中间层解耦

---

## 拆分实战示例

### 示例 1：大型 React 组件拆分

**原始文件（UserDashboard.tsx - 800 行）**：
\`\`\`tsx
import React, { useState, useEffect } from 'react';
import './styles.css';

export function UserDashboard() {
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});

  // 150 行：用户信息相关逻辑
  useEffect(() => { /* 获取用户信息 */ }, []);
  const updateUserProfile = () => { /* 更新用户 */ };

  // 200 行：订单相关逻辑
  useEffect(() => { /* 获取订单 */ }, []);
  const filterOrders = () => { /* 过滤订单 */ };

  // 150 行：统计相关逻辑
  useEffect(() => { /* 获取统计 */ }, []);
  const calculateStats = () => { /* 计算统计 */ };

  // 300 行：渲染逻辑
  return (
    <div className="dashboard">
      {/* Header */}
      <div className="header">
        {/* 50 行 */}
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        {/* 100 行 */}
      </div>

      {/* Main Content */}
      <div className="main">
        {/* User Info Section - 80 行 */}
        <div className="user-info">
          <h2>{user?.name}</h2>
          {/* ... */}
        </div>

        {/* Orders Section - 100 行 */}
        <div className="orders">
          <h3>我的订单</h3>
          {/* ... */}
        </div>

        {/* Stats Section - 70 行 */}
        <div className="stats">
          <h3>统计数据</h3>
          {/* ... */}
        </div>
      </div>
    </div>
  );
}
\`\`\`

**拆分方案**：

**1. 拆分自定义 Hooks**
\`\`\`typescript
// hooks/useUser.ts
export function useUser() {
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    // 获取用户信息
  }, []);

  const updateUserProfile = () => {
    // 更新用户
  };

  return { user, updateUserProfile };
}

// hooks/useOrders.ts
export function useOrders() {
  const [orders, setOrders] = useState([]);
  
  useEffect(() => {
    // 获取订单
  }, []);

  const filterOrders = () => {
    // 过滤订单
  };

  return { orders, filterOrders };
}

// hooks/useStats.ts
export function useStats() {
  const [stats, setStats] = useState({});
  
  useEffect(() => {
    // 获取统计
  }, []);

  const calculateStats = () => {
    // 计算统计
  };

  return { stats, calculateStats };
}
\`\`\`

**2. 拆分子组件**
\`\`\`tsx
// components/DashboardHeader.tsx
export function DashboardHeader({ user }) {
  return (
    <div className="header">
      {/* 50 行 */}
    </div>
  );
}

// components/DashboardSidebar.tsx
export function DashboardSidebar() {
  return (
    <div className="sidebar">
      {/* 100 行 */}
    </div>
  );
}

// components/UserInfoSection.tsx
export function UserInfoSection({ user, onUpdate }) {
  return (
    <div className="user-info">
      <h2>{user?.name}</h2>
      {/* 80 行 */}
    </div>
  );
}

// components/OrdersSection.tsx
export function OrdersSection({ orders, onFilter }) {
  return (
    <div className="orders">
      <h3>我的订单</h3>
      {/* 100 行 */}
    </div>
  );
}

// components/StatsSection.tsx
export function StatsSection({ stats }) {
  return (
    <div className="stats">
      <h3>统计数据</h3>
      {/* 70 行 */}
    </div>
  );
}
\`\`\`

**3. 重构主组件（只有 50 行）**
\`\`\`tsx
// components/UserDashboard/index.tsx
import React from 'react';
import { useUser } from './hooks/useUser';
import { useOrders } from './hooks/useOrders';
import { useStats } from './hooks/useStats';
import { DashboardHeader } from './DashboardHeader';
import { DashboardSidebar } from './DashboardSidebar';
import { UserInfoSection } from './UserInfoSection';
import { OrdersSection } from './OrdersSection';
import { StatsSection } from './StatsSection';
import './styles.css';

export function UserDashboard() {
  const { user, updateUserProfile } = useUser();
  const { orders, filterOrders } = useOrders();
  const { stats } = useStats();

  return (
    <div className="dashboard">
      <DashboardHeader user={user} />
      <DashboardSidebar />
      <div className="main">
        <UserInfoSection user={user} onUpdate={updateUserProfile} />
        <OrdersSection orders={orders} onFilter={filterOrders} />
        <StatsSection stats={stats} />
      </div>
    </div>
  );
}
\`\`\`

**最终目录结构**：
\`\`\`
src/components/UserDashboard/
├── index.tsx                    # 主组件 (50 行)
├── DashboardHeader.tsx          # 子组件 (50 行)
├── DashboardSidebar.tsx         # 子组件 (100 行)
├── UserInfoSection.tsx          # 子组件 (80 行)
├── OrdersSection.tsx            # 子组件 (100 行)
├── StatsSection.tsx             # 子组件 (70 行)
├── hooks/
│   ├── useUser.ts              # Hook (60 行)
│   ├── useOrders.ts            # Hook (80 行)
│   └── useStats.ts             # Hook (60 行)
└── styles.css
\`\`\`

**优势**：
- ✅ 每个文件职责单一，易于理解
- ✅ 组件可独立测试
- ✅ 逻辑可复用（Hooks）
- ✅ 多人协作减少冲突
- ✅ 按需导入，优化打包体积

---

### 示例 2：工具函数文件拆分

**原始文件（utils.ts - 600 行）**：
\`\`\`typescript
// 字符串工具 (150 行)
export function capitalize(str: string): string { }
export function truncate(str: string, length: number): string { }
export function slugify(str: string): string { }

// 日期工具 (150 行)
export function formatDate(date: Date): string { }
export function parseDate(str: string): Date { }
export function addDays(date: Date, days: number): Date { }

// 数组工具 (100 行)
export function unique<T>(arr: T[]): T[] { }
export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> { }

// 验证工具 (100 行)
export function isEmail(str: string): boolean { }
export function isURL(str: string): boolean { }

// 数学工具 (100 行)
export function round(num: number, decimals: number): number { }
export function clamp(num: number, min: number, max: number): number { }
\`\`\`

**拆分后**：
\`\`\`
src/utils/
├── index.ts              # 统一导出
├── string.ts             # 字符串工具
├── date.ts               # 日期工具
├── array.ts              # 数组工具
├── validation.ts         # 验证工具
└── math.ts               # 数学工具
\`\`\`

\`\`\`typescript
// utils/index.ts (统一导出)
export * from './string';
export * from './date';
export * from './array';
export * from './validation';
export * from './math';

// 使用方式不变
import { capitalize, formatDate, unique } from '@/utils';
\`\`\`

---

### 示例 3：Vue 组件拆分

**原始文件（ProductList.vue - 700 行）**：
\`\`\`vue
<template>
  <div class="product-list">
    <!-- Filter Section - 150 行 -->
    <div class="filters">
      <!-- 过滤器 UI -->
    </div>

    <!-- Product Grid - 300 行 -->
    <div class="products">
      <!-- 产品列表 -->
    </div>

    <!-- Pagination - 100 行 -->
    <div class="pagination">
      <!-- 分页 -->
    </div>
  </div>
</template>

<script setup lang="ts">
// 250 行逻辑
const products = ref([]);
const filters = ref({});
// ...
</script>

<style scoped>
/* 100 行样式 */
</style>
\`\`\`

**拆分后**：
\`\`\`
src/components/ProductList/
├── ProductList.vue              # 主组件 (100 行)
├── ProductFilters.vue           # 过滤器组件 (150 行)
├── ProductGrid.vue              # 产品网格 (200 行)
├── ProductCard.vue              # 产品卡片 (100 行)
├── ProductPagination.vue        # 分页组件 (100 行)
├── composables/
│   ├── useProducts.ts          # 产品数据逻辑
│   └── useFilters.ts           # 过滤逻辑
└── styles.module.css
\`\`\`

---

## 拆分步骤

### Step 1: 分析依赖关系
\`\`\`bash
# 使用工具分析依赖
npx madge --circular src/

# 或手动绘制依赖图
\`\`\`

### Step 2: 识别独立模块
- 找出职责单一的代码块
- 识别可复用的逻辑
- 标记高内聚低耦合的部分

### Step 3: 制定拆分计划
- 确定目录结构
- 规划文件命名
- 设计导出策略

### Step 4: 逐步拆分
- 从最独立的模块开始
- 先拆分，后重构
- 每次拆分后运行测试

### Step 5: 更新导入
- 批量替换 import 路径
- 使用 IDE 的重构功能
- 验证所有引用

### Step 6: 清理优化
- 删除未使用的导出
- 优化重复代码
- 添加文档注释

---

## 拆分工具推荐

### VS Code 扩展
- **Move TS** - 自动更新 import
- **JavaScript Refactor** - 快速提取函数/组件
- **Path Intellisense** - 路径自动补全

### CLI 工具
- **madge** - 依赖分析
- **jscodeshift** - 代码自动化重构
- **ts-morph** - TypeScript AST 操作

---

现在请分析文件并提供详细的拆分方案，包括：
1. 拆分策略分析
2. 建议的目录结构
3. 每个新文件的内容
4. 导入导出关系
5. 迁移步骤`;

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
          text: `❌ 文件拆分失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

