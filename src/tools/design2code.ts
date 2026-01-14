/**
 * design2code - 设计稿转代码工具
 * 
 * 功能：
 * 1. 根据设计稿图片生成页面代码（支持图片 URL 或 base64）
 * 2. 根据设计稿描述生成页面代码
 * 3. 将 HTML 转换为 Vue/React 组件
 * 4. 1:1 还原设计稿布局和样式
 */

const PROMPT_TEMPLATE = `# 🎨 设计稿转代码指南

## 📋 任务信息

{task_info}

---

## 🎯 转换目标

**目标框架**: {framework}
**样式方案**: {style_solution}
**组件类型**: {component_type}

---

## 📐 设计还原要求

### 1. 布局还原（Layout）
- ✅ 使用 Flexbox/Grid 实现响应式布局
- ✅ 严格按照设计稿的间距、对齐方式
- ✅ 保持元素的相对位置和层级关系
- ✅ 考虑不同屏幕尺寸的适配

### 2. 样式还原（Styling）
- ✅ 精确还原颜色值（使用设计稿中的色值）
- ✅ 还原字体大小、行高、字重
- ✅ 还原圆角、阴影、边框等细节
- ✅ 还原动画和过渡效果

### 3. 交互还原（Interaction）
- ✅ 实现 hover、active、focus 等状态
- ✅ 添加点击、滚动等交互效果
- ✅ 实现表单验证和反馈
- ✅ 添加加载状态和错误处理

### 4. 响应式设计（Responsive）
- ✅ 移动端适配（< 768px）
- ✅ 平板适配（768px - 1024px）
- ✅ 桌面端适配（> 1024px）
- ✅ 使用媒体查询或响应式单位

---

## 🛠️ 技术实现

### React 实现要点
\`\`\`typescript
// 1. 使用 TypeScript 定义 Props
interface ComponentProps {
  // 定义属性类型
}

// 2. 使用 Hooks 管理状态
const [state, setState] = useState()

// 3. 使用 CSS Modules 或 Tailwind CSS
import styles from './Component.module.css'

// 4. 组件拆分原则
// - 单一职责
// - 可复用性
// - 性能优化（memo, useMemo, useCallback）
\`\`\`

### Vue 3 实现要点
\`\`\`vue
<script setup lang="ts">
// 1. 使用 Composition API
import { ref, computed, onMounted } from 'vue'

// 2. 定义 Props 和 Emits
interface Props {
  // 定义属性类型
}
const props = defineProps<Props>()
const emit = defineEmits<{
  // 定义事件类型
}>()

// 3. 响应式状态管理
const state = ref()

// 4. 生命周期钩子
onMounted(() => {
  // 初始化逻辑
})
</script>

<template>
  <!-- 模板内容 -->
</template>

<style scoped>
/* 样式内容 */
</style>
\`\`\`

---

## 🎨 样式方案选择

### Tailwind CSS（推荐）
\`\`\`jsx
<div className="flex items-center justify-between p-4 bg-white rounded-lg shadow-md">
  <h2 className="text-xl font-bold text-gray-900">标题</h2>
  <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
    按钮
  </button>
</div>
\`\`\`

### CSS Modules
\`\`\`css
.container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
\`\`\`

### Styled Components
\`\`\`typescript
const Container = styled.div\`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
\`;
\`\`\`

---

## 📦 组件结构

### 页面级组件（Page Component）
\`\`\`
src/pages/
  ├── HomePage/
  │   ├── index.tsx          # 页面主文件
  │   ├── components/        # 页面专用组件
  │   │   ├── Header.tsx
  │   │   ├── Hero.tsx
  │   │   └── Footer.tsx
  │   ├── hooks/            # 页面专用 Hooks
  │   │   └── usePageData.ts
  │   ├── types.ts          # 类型定义
  │   └── styles.module.css # 样式文件
\`\`\`

### 通用组件（Common Component）
\`\`\`
src/components/
  ├── Button/
  │   ├── index.tsx
  │   ├── Button.test.tsx
  │   └── styles.module.css
  ├── Input/
  └── Card/
\`\`\`

---

## ✅ 代码质量要求

### 1. TypeScript 类型安全
- ✅ 所有 Props 都有类型定义
- ✅ 事件处理函数有类型注解
- ✅ API 响应有类型定义

### 2. 可访问性（A11y）
- ✅ 使用语义化 HTML 标签
- ✅ 添加 ARIA 属性
- ✅ 键盘导航支持
- ✅ 屏幕阅读器友好

### 3. 性能优化
- ✅ 图片懒加载
- ✅ 代码分割
- ✅ 避免不必要的重渲染
- ✅ 使用虚拟滚动（长列表）

### 4. 代码规范
- ✅ 遵循 ESLint 规则
- ✅ 统一的命名规范
- ✅ 添加必要的注释
- ✅ 组件拆分合理

---

## 📝 输出内容

请生成以下内容：

### 1. 组件代码
- 完整的组件实现
- TypeScript 类型定义
- 样式文件

### 2. 使用示例
- 组件的使用方法
- Props 说明
- 常见场景示例

### 3. 注意事项
- 浏览器兼容性
- 性能优化建议
- 可能的改进方向

---

## 🎯 开始转换

{conversion_guide}

---

*工具: MCP Probe Kit - design2code*
`;

export async function design2code(args: any) {
  try {
    const input = args?.input;
    const framework = args?.framework || "vue";
    const styleSolution = args?.style_solution || "tailwind";
    const componentType = args?.component_type || "page";

    if (!input) {
      throw new Error("缺少必填参数: input（设计稿图片 URL/base64、设计稿描述或 HTML 代码）");
    }

    // 判断输入类型
    const isImageUrl = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)/i.test(input.trim());
    const isBase64Image = /^data:image\/(png|jpeg|jpg|gif|webp|svg);base64,/.test(input.trim());
    const isHTML = input.trim().startsWith("<");
    
    let taskInfo = "";
    let conversionGuide = "";

    if (isImageUrl || isBase64Image) {
      // 图片转换模式
      const imageType = isImageUrl ? "图片 URL" : "Base64 图片";
      taskInfo = `**输入类型**: 设计稿图片\n**图片来源**: ${imageType}\n${isImageUrl ? `**图片地址**: ${input}` : "**图片**: [Base64 编码图片]"}`;
      
      conversionGuide = `### 设计稿图片分析步骤

1. **视觉分析**
   - 仔细观察设计稿的整体布局
   - 识别页面的主要区域（导航栏、内容区、侧边栏、底部等）
   - 分析颜色方案、字体、间距等设计规范
   - 识别重复使用的设计模式和组件

2. **元素识别**
   - 标题、段落、按钮、输入框等基础元素
   - 卡片、列表、表格等容器组件
   - 图标、图片、背景等视觉元素
   - 导航菜单、下拉框、弹窗等交互组件

3. **布局还原**
   - 使用 Flexbox/Grid 实现主体布局
   - 精确测量元素间距和尺寸
   - 实现响应式断点设计
   - 保持视觉层次和对齐关系

4. **样式还原**
   - 提取颜色值（主色、辅助色、文字色、背景色）
   - 还原字体大小、行高、字重
   - 实现圆角、阴影、边框等细节
   - 添加 hover、active 等交互状态

5. **组件化开发**
   - 将设计稿拆分为可复用组件
   - 使用 ${framework === "vue" ? "Vue 3 Composition API" : "React Hooks"}
   - 添加 TypeScript 类型定义
   - 实现组件间的数据传递

6. **交互实现**
   - 添加点击、滚动等事件处理
   - 实现表单验证和提交
   - 添加加载状态和错误处理
   - 实现动画和过渡效果

7. **响应式适配**
   - 移动端布局调整（< 768px）
   - 平板端优化（768px - 1024px）
   - 桌面端完整展示（> 1024px）
   - 使用媒体查询或响应式单位

**注意事项**：
- 如果图片中有文字，请尽量识别并使用真实文本而非图片
- 图标优先使用 SVG 或图标库（如 Heroicons、Lucide）
- 图片资源使用占位符，并注明实际使用时需要替换
- 保持代码的可维护性和可扩展性`;
    } else if (isHTML) {
      // HTML 转换模式
      taskInfo = `**输入类型**: HTML 代码转换\n**源代码**:\n\`\`\`html\n${input}\n\`\`\``;
      
      conversionGuide = `### HTML 转换步骤

1. **分析 HTML 结构**
   - 识别语义化标签
   - 提取 class 和 id
   - 分析嵌套层级

2. **转换为组件**
   - 将 HTML 转换为 ${framework === "vue" ? "Vue 模板" : "JSX"}
   - 提取可复用的子组件
   - 添加 TypeScript 类型

3. **样式迁移**
   - 将内联样式转换为 ${styleSolution}
   - 提取公共样式变量
   - 优化样式结构

4. **添加交互逻辑**
   - 识别需要状态管理的部分
   - 添加事件处理
   - 实现表单验证

5. **优化和完善**
   - 添加响应式设计
   - 优化性能
   - 添加可访问性支持`;
    } else {
      // 设计稿描述模式
      taskInfo = `**输入类型**: 设计稿描述\n**设计需求**:\n${input}`;
      
      conversionGuide = `### 设计稿实现步骤

1. **理解设计需求**
   - 分析页面布局结构
   - 识别设计元素和组件
   - 确定交互流程

2. **规划组件结构**
   - 划分页面区域（Header、Main、Footer）
   - 识别可复用组件
   - 设计组件层级关系

3. **实现布局**
   - 使用 Flexbox/Grid 布局
   - 实现响应式设计
   - 确保跨浏览器兼容

4. **实现样式**
   - 还原设计稿的视觉效果
   - 使用 ${styleSolution} 编写样式
   - 添加动画和过渡效果

5. **实现交互**
   - 添加状态管理
   - 实现用户交互
   - 添加数据获取逻辑

6. **测试和优化**
   - 测试不同屏幕尺寸
   - 优化性能
   - 确保可访问性`;
    }

    const guide = PROMPT_TEMPLATE
      .replace(/{task_info}/g, taskInfo)
      .replace(/{framework}/g, framework === "vue" ? "Vue 3 + TypeScript" : "React + TypeScript")
      .replace(/{style_solution}/g, styleSolution === "tailwind" ? "Tailwind CSS" : styleSolution === "css-modules" ? "CSS Modules" : "Styled Components")
      .replace(/{component_type}/g, componentType === "page" ? "页面组件" : "通用组件")
      .replace(/{conversion_guide}/g, conversionGuide);

    // 如果是图片输入，添加图片内容
    if (isImageUrl || isBase64Image) {
      return {
        content: [
          { type: "text", text: guide },
          { 
            type: "image", 
            data: isBase64Image ? input.split(',')[1] : input,
            mimeType: isBase64Image ? input.match(/data:image\/([^;]+);/)?.[1] || "png" : "image/png"
          }
        ],
      };
    }

    return {
      content: [{ type: "text", text: guide }],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ 错误: ${errorMsg}` }],
      isError: true,
    };
  }
}
