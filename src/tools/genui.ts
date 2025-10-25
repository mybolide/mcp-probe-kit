// genui 工具实现
export async function genui(args: any) {
  try {
    const description = args?.description || "";
    const framework = args?.framework || "react"; // react, vue, html

    const message = `请生成以下 UI 组件：

📝 **组件描述**：
${description || "请描述需要的 UI 组件"}

⚛️ **框架**：${framework}

---

## UI 组件生成指南

### 第一步：理解需求

**组件类型**：
- 基础组件（Button, Input, Card）
- 表单组件（Form, Select, Checkbox）
- 数据展示（Table, List, Grid）
- 反馈组件（Modal, Toast, Loading）
- 导航组件（Menu, Tabs, Breadcrumb）
- 布局组件（Layout, Container, Flex）

### 第二步：设计原则

**1️⃣ 组件化**
- 单一职责
- 可复用
- 可组合

**2️⃣ 可访问性（A11y）**
- 语义化 HTML
- ARIA 属性
- 键盘导航
- 屏幕阅读器支持

**3️⃣ 响应式**
- 移动端优先
- 断点设计
- 弹性布局

**4️⃣ 性能**
- 懒加载
- 虚拟滚动
- 防抖节流

---

## React 组件示例

### 基础 Button 组件
\`\`\`tsx
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  // 基础样式
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white hover:bg-blue-700",
        destructive: "bg-red-600 text-white hover:bg-red-700",
        outline: "border border-gray-300 bg-transparent hover:bg-gray-100",
        ghost: "hover:bg-gray-100",
        link: "text-blue-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, ...props }, ref) => {
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
\`\`\`

**使用示例：**
\`\`\`tsx
<Button variant="default" size="lg">
  提交
</Button>

<Button variant="outline" isLoading>
  加载中...
</Button>

<Button variant="ghost" size="icon">
  <Icon />
</Button>
\`\`\`

---

### 表单输入组件
\`\`\`tsx
import React from 'react';
import { useController, Control } from 'react-hook-form';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  control?: Control<any>;
  name: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, control, name, ...props }, ref) => {
    const { field } = useController({
      name,
      control,
      defaultValue: props.defaultValue || '',
    });

    return (
      <div className="w-full space-y-2">
        {label && (
          <label
            htmlFor={name}
            className="text-sm font-medium text-gray-700"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        
        <input
          {...field}
          {...props}
          ref={ref}
          id={name}
          aria-invalid={!!error}
          aria-describedby={error ? \`\${name}-error\` : undefined}
          className={\`
            w-full px-3 py-2 border rounded-md
            focus:outline-none focus:ring-2 focus:ring-blue-500
            disabled:bg-gray-100 disabled:cursor-not-allowed
            \${error ? 'border-red-500' : 'border-gray-300'}
            \${className || ''}
          \`}
        />
        
        {error && (
          <p id={\`\${name}-error\`} className="text-sm text-red-600">
            {error}
          </p>
        )}
        
        {helperText && !error && (
          <p className="text-sm text-gray-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
\`\`\`

---

### Modal 弹窗组件
\`\`\`tsx
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}) => {
  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      
      {/* 弹窗内容 */}
      <div
        className={\`
          relative bg-white rounded-lg shadow-xl
          w-full mx-4 \${sizeClasses[size]}
          max-h-[90vh] flex flex-col
          animate-in fade-in slide-in-from-bottom-4
        \`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* 头部 */}
        {title && (
          <div className="px-6 py-4 border-b">
            <h2 id="modal-title" className="text-xl font-semibold">
              {title}
            </h2>
          </div>
        )}
        
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="关闭"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        {/* 内容 */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
\`\`\`

---

### Table 数据表格
\`\`\`tsx
import React from 'react';

interface Column<T> {
  key: keyof T | string;
  title: string;
  render?: (value: any, record: T, index: number) => React.ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: keyof T;
  loading?: boolean;
  onRowClick?: (record: T) => void;
}

export function Table<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  loading,
  onRowClick,
}: TableProps<T>) {
  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  if (data.length === 0) {
    return <div className="text-center py-8 text-gray-500">暂无数据</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col, index) => (
              <th
                key={String(col.key) || index}
                style={{ width: col.width }}
                className={\`
                  px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider
                  text-\${col.align || 'left'}
                \`}
              >
                {col.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((record, rowIndex) => (
            <tr
              key={String(record[rowKey])}
              onClick={() => onRowClick?.(record)}
              className={onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}
            >
              {columns.map((col, colIndex) => {
                const value = col.key in record ? record[col.key as keyof T] : undefined;
                return (
                  <td
                    key={colIndex}
                    className={\`px-6 py-4 whitespace-nowrap text-sm text-\${col.align || 'left'}\`}
                  >
                    {col.render ? col.render(value, record, rowIndex) : String(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
\`\`\`

---

## Tailwind CSS 配置

\`\`\`js
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      keyframes: {
        'fade-in': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        'slide-in-from-bottom': {
          from: { transform: 'translateY(1rem)' },
          to: { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in-from-bottom-4': 'slide-in-from-bottom 0.3s ease-out',
      },
    },
  },
  plugins: [],
};
\`\`\`

---

## Vue 3 组件示例

### 基础 Button 组件 (Vue 3 + TypeScript)
\`\`\`vue
<template>
  <button
    :class="buttonClasses"
    :disabled="isLoading || disabled"
    v-bind="$attrs"
  >
    <svg
      v-if="isLoading"
      class="mr-2 h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  variant?: 'default' | 'destructive' | 'outline' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  isLoading?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
  isLoading: false,
  disabled: false,
});

const buttonClasses = computed(() => {
  const base = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
  
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
    outline: 'border border-gray-300 bg-transparent hover:bg-gray-100',
    ghost: 'hover:bg-gray-100',
    link: 'text-blue-600 underline-offset-4 hover:underline',
  };
  
  const sizes = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 px-3',
    lg: 'h-11 px-8',
    icon: 'h-10 w-10',
  };
  
  return \`\${base} \${variants[props.variant]} \${sizes[props.size]}\`;
});
</script>
\`\`\`

**使用示例：**
\`\`\`vue
<template>
  <div>
    <Button variant="default" size="lg">提交</Button>
    <Button variant="outline" :is-loading="true">加载中...</Button>
    <Button variant="ghost" size="icon">
      <Icon />
    </Button>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/Button.vue';
</script>
\`\`\`

---

### Vue 3 Input 组件
\`\`\`vue
<template>
  <div class="w-full space-y-2">
    <label
      v-if="label"
      :for="inputId"
      class="text-sm font-medium text-gray-700"
    >
      {{ label }}
      <span v-if="required" class="text-red-500 ml-1">*</span>
    </label>
    
    <input
      :id="inputId"
      v-model="model"
      :type="type"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :aria-invalid="!!error"
      :aria-describedby="error ? \`\${inputId}-error\` : undefined"
      :class="inputClasses"
      v-bind="$attrs"
    />
    
    <p v-if="error" :id="\`\${inputId}-error\`" class="text-sm text-red-600">
      {{ error }}
    </p>
    
    <p v-else-if="helperText" class="text-sm text-gray-500">
      {{ helperText }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, useAttrs } from 'vue';

interface Props {
  modelValue?: string | number;
  label?: string;
  type?: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  required: false,
  disabled: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
}>();

const attrs = useAttrs();
const inputId = computed(() => attrs.id as string || \`input-\${Math.random().toString(36).slice(2)}\`);

const model = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const inputClasses = computed(() => {
  return \`
    w-full px-3 py-2 border rounded-md
    focus:outline-none focus:ring-2 focus:ring-blue-500
    disabled:bg-gray-100 disabled:cursor-not-allowed
    \${props.error ? 'border-red-500' : 'border-gray-300'}
  \`;
});
</script>
\`\`\`

---

### Vue 3 Modal 组件
\`\`\`vue
<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center"
        @click="handleClose"
      >
        <!-- 背景遮罩 -->
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        
        <!-- 弹窗内容 -->
        <div
          :class="modalClasses"
          @click.stop
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? 'modal-title' : undefined"
        >
          <!-- 头部 -->
          <div v-if="title" class="px-6 py-4 border-b">
            <h2 id="modal-title" class="text-xl font-semibold">
              {{ title }}
            </h2>
          </div>
          
          <!-- 关闭按钮 -->
          <button
            @click="handleClose"
            class="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            aria-label="关闭"
          >
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          <!-- 内容 -->
          <div class="px-6 py-4 overflow-y-auto flex-1">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { onKeyStroke } from '@vueuse/core';

interface Props {
  modelValue: boolean;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const handleClose = () => {
  emit('update:modelValue', false);
};

// ESC 关闭
onKeyStroke('Escape', () => {
  if (props.modelValue) {
    handleClose();
  }
});

// 锁定 body 滚动
watch(() => props.modelValue, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : '';
});

const modalClasses = computed(() => {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };
  
  return \`
    relative bg-white rounded-lg shadow-xl
    w-full mx-4 \${sizeClasses[props.size]}
    max-h-[90vh] flex flex-col
  \`;
});
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
\`\`\`

---

## 组件库推荐

### 🎨 React UI 组件库
- **shadcn/ui** - 可定制的 React 组件
- **Radix UI** - 无样式的可访问组件
- **Headless UI** - Tailwind 官方无样式组件
- **Ant Design** - 企业级 UI 设计语言
- **Material-UI** - Google Material Design

### 🎨 Vue UI 组件库
- **Element Plus** - 基于 Vue 3 的企业级组件库
- **Naive UI** - 完整的 TypeScript 支持
- **Ant Design Vue** - Vue 版本的 Ant Design
- **Vuetify** - Material Design 组件框架
- **PrimeVue** - 丰富的 UI 组件集合

### 🎭 动画库
- **Framer Motion** - React 动画库
- **React Spring** - 基于物理的动画
- **GSAP** - 高性能动画引擎（React/Vue 通用）
- **@vueuse/motion** - Vue 3 组合式动画

### 📱 响应式工具
- **Tailwind CSS** - 实用优先的 CSS 框架
- **UnoCSS** - 即时原子化 CSS 引擎
- **CSS Modules** - 局部作用域 CSS

---

现在请根据需求生成完整的 UI 组件代码，包括：
1. 组件实现（TypeScript）
2. 样式（Tailwind CSS）
3. 使用示例
4. Props 接口定义
5. 可访问性说明

**根据框架选择：**
- **React**: 使用 Hooks、forwardRef、TypeScript
- **Vue 3**: 使用 Composition API、script setup、TypeScript
- **HTML**: 使用原生 JavaScript 和 Web Components`;

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
          text: `❌ 生成 UI 组件失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

