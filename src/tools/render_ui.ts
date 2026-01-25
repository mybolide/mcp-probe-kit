/**
 * UI 渲染工具
 * 
 * 将 JSON 模板渲染为最终代码
 * 自动应用设计规范，确保样式统一
 */

const PROMPT_TEMPLATE = `# 🎨 UI 代码渲染

## 🎯 任务目标

将 JSON 模板渲染为最终代码，自动应用设计规范。

**输入文件**: \`{templatePath}\`
**框架**: {framework}

---

## 📋 执行流程

### 第1步：读取必要文件

**操作**:
1. 读取 UI 模板: \`{templatePath}\`
2. 读取组件目录: \`docs/component-catalog.json\`
3. 读取设计指南: \`docs/design-system.md\` ✨
4. 读取设计规范: \`docs/design-system.json\`

**为什么要读取 design-system.md？**
- 理解设计理念和原则（如：专业、现代、简洁）
- 了解配色方案的使用场景（主色用于主要操作，辅色用于次要操作）
- 理解字体配对逻辑（标题用什么字体、正文用什么字体）
- 学习间距系统规则（什么时候用大间距、小间距）
- 查看反模式警告（避免什么样的设计）
- 确保生成的代码符合设计理念

**验证**:
- [ ] 所有文件都存在
- [ ] JSON 格式正确
- [ ] 模板引用的组件在组件目录中存在
- [ ] 理解了 design-system.md 中的设计理念

---

### 第2步：解析模板结构

**操作**:
1. 解析 JSON 模板的 layout 结构
2. 识别所有使用的组件
3. 提取组件的 props

**示例模板**:
\`\`\`json
{
  "name": "LoginForm",
  "layout": {
    "type": "Container",
    "props": { "maxWidth": "sm" },
    "children": [
      {
        "type": "Card",
        "props": { "title": "登录" },
        "children": [
          {
            "type": "Input",
            "props": { "label": "用户名", "type": "text" }
          },
          {
            "type": "Button",
            "props": { "variant": "primary", "label": "登录" }
          }
        ]
      }
    ]
  }
}
\`\`\`

---

### 第3步：替换占位符

**操作**:
对每个组件，从组件目录中获取样式定义，然后替换占位符。

**占位符替换规则**:

1. **颜色占位符**:
   - \`{colors.primary.500}\` → 从 design-system.json 读取 \`colors.primary["500"]\`
   - 示例: \`bg-[{colors.primary.500}]\` → \`bg-[#3b82f6]\`

2. **字体占位符**:
   - \`{typography.fontSize.base}\` → 从 design-system.json 读取
   - 示例: \`text-[{typography.fontSize.base}]\` → \`text-[1rem]\`

3. **间距占位符**:
   - \`{spacing.scale.4}\` → 从 design-system.json 读取 \`spacing.scale[4]\`
   - 示例: \`space-y-[{spacing.scale.4}]\` → \`space-y-4\`

4. **圆角占位符**:
   - \`{borderRadius.md}\` → 从 design-system.json 读取
   - 示例: \`rounded-[{borderRadius.md}]\` → \`rounded-md\`

5. **阴影占位符**:
   - \`{shadows.md}\` → 从 design-system.json 读取
   - 示例: \`shadow-[{shadows.md}]\` → \`shadow-md\`

**替换算法**:
\`\`\`typescript
function replacePlaceholders(styleString: string, designSystem: any): string {
  // 匹配 {path.to.value} 格式
  return styleString.replace(/\\{([^}]+)\\}/g, (match, path) => {
    const value = getValueByPath(designSystem, path);
    return value || match; // 找不到则保留原样
  });
}

function getValueByPath(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object') {
      // 处理数组索引，如 spacing.scale.4
      if (!isNaN(Number(key)) && Array.isArray(current)) {
        return current[Number(key)];
      }
      return current[key];
    }
    return undefined;
  }, obj);
}
\`\`\`

---

### 第4步：生成代码

根据框架生成对应的代码。

#### React 代码生成

\`\`\`tsx
import React from 'react';

export const {componentName}: React.FC = () => {
  return (
    <div className="{containerClasses}">
      {/* 递归渲染子组件 */}
      <div className="{cardClasses}">
        <h2 className="text-2xl font-semibold mb-4">{title}</h2>
        
        <div className="space-y-4">
          {/* Input 组件 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {label}
            </label>
            <input
              type="{type}"
              className="{inputClasses}"
            />
          </div>
          
          {/* Button 组件 */}
          <button className="{buttonClasses}">
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
\`\`\`

**关键点**:
- 所有 className 都是替换占位符后的实际值
- 颜色、间距、圆角都来自设计规范
- 保证样式统一

#### Vue 3 代码生成

\`\`\`vue
<template>
  <div :class="containerClasses">
    <div :class="cardClasses">
      <h2 class="text-2xl font-semibold mb-4">{{ title }}</h2>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            {{ label }}
          </label>
          <input
            :type="type"
            :class="inputClasses"
          />
        </div>
        
        <button :class="buttonClasses">
          {{ buttonLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const title = ref('{title}');
const label = ref('{label}');
const type = ref('{type}');
const buttonLabel = ref('{buttonLabel}');

const containerClasses = '{containerClasses}';
const cardClasses = '{cardClasses}';
const inputClasses = '{inputClasses}';
const buttonClasses = '{buttonClasses}';
</script>
\`\`\`

---

### 第5步：代码优化

**操作**:
1. 格式化代码（缩进、换行）
2. 添加 TypeScript 类型
3. 添加注释说明
4. 提取可复用的样式类

**优化示例**:
\`\`\`tsx
// 提取常量
const BUTTON_CLASSES = {
  primary: 'bg-[#3b82f6] text-white hover:bg-[#2563eb]',
  secondary: 'bg-[#8b5cf6] text-white hover:bg-[#7c3aed]',
} as const;

// 使用常量
<button className={\`\${baseClasses} \${BUTTON_CLASSES[variant]}\`}>
  {label}
</button>
\`\`\`

---

## ✅ 输出结果

生成的代码包含：

1. **完整的组件实现**
   - React: Hooks + TypeScript
   - Vue: Composition API + TypeScript
   - HTML: 原生 JavaScript

2. **自动应用的设计规范**
   - ✅ 设计理念来自 design-system.md（UI 风格、设计原则）
   - ✅ 颜色来自 design-system.json（精确的色值）
   - ✅ 字体来自 design-system.json（字体族和大小）
   - ✅ 间距来自 design-system.json（间距比例）
   - ✅ 圆角来自 design-system.json（圆角大小）
   - ✅ 阴影来自 design-system.json（阴影效果）
   - ✅ 最佳实践来自 design-system.md（使用建议）

3. **代码特点**
   - ✅ 类型安全（TypeScript）
   - ✅ 可访问性（A11y）
   - ✅ 响应式设计
   - ✅ 样式统一
   - ✅ 符合设计理念

---

## 📌 注意事项

1. **占位符格式**: 必须严格遵循 \`{path.to.value}\` 格式
2. **路径正确性**: 确保路径在 design-system.json 中存在
3. **组件存在性**: 模板中的组件必须在 component-catalog.json 中定义
4. **嵌套处理**: 正确处理组件的嵌套关系

---

## 🚀 使用示例

### 示例 1：渲染登录表单

\`\`\`bash
# 假设已有 docs/ui/login-form.json
render_ui docs/ui/login-form.json --framework=react
\`\`\`

**输出**:
- 完整的 React 组件代码
- 自动应用设计规范
- 可直接使用

### 示例 2：渲染数据表格

\`\`\`bash
render_ui docs/ui/data-table.json --framework=vue
\`\`\`

**输出**:
- 完整的 Vue 3 组件代码
- 自动应用设计规范
- 包含 TypeScript 类型

---

## ⚠️ 边界约束

- ❌ 仅输出代码，不自动创建文件
- ❌ 不执行代码或命令
- ✅ 输出完整可用的组件代码
- ✅ 自动应用设计规范
- ✅ 保证样式统一

---

## 🔗 相关工具

- **ui_design_system**: 生成设计规范
- **init_component_catalog**: 生成组件目录
- **ui_search --mode=template**: 获取 UI 模板
- **start_ui**: 一键完成整个流程（推荐）
`;

/**
 * UI 渲染工具
 */
export async function renderUi(args: any) {
  try {
    // 解析参数
    const templatePath = args.template || args.path || args.input || '';
    const framework = args.framework || 'react';
    
    if (!templatePath) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 缺少必要参数

**用法**:
\`\`\`
render_ui <template-path> [--framework=react|vue|html]
\`\`\`

**示例**:
\`\`\`
render_ui docs/ui/login-form.json
render_ui docs/ui/login-form.json --framework=vue
\`\`\`

**提示**: 
- 模板文件应该是 JSON 格式
- 确保已运行 \`ui_design_system\` 和 \`init_component_catalog\`
`,
          },
        ],
        isError: true,
      };
    }
    
    const guide = PROMPT_TEMPLATE
      .replace(/{templatePath}/g, templatePath)
      .replace(/{framework}/g, framework);
    
    return {
      content: [
        {
          type: "text",
          text: guide,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ UI 渲染失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
