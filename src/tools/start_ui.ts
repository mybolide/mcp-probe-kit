/**
 * 统一 UI 开发编排工具
 * 
 * 一键完成整个 UI 开发流程：
 * 1. 检查设计规范
 * 2. 检查/生成组件目录
 * 3. 搜索/生成 UI 模板
 * 4. 渲染最终代码
 */

import { parseArgs, getString } from "../utils/parseArgs.js";

const PROMPT_TEMPLATE = `# 🎨 统一 UI 开发流程

## 🎯 任务目标

根据用户描述，自动完成整个 UI 开发流程。

**用户需求**: {description}
**框架**: {framework}
**模板名称**: {templateName}

---

## 📋 执行流程

### 第1步：检查并理解设计系统 ✅

**操作**:
1. 检查文件 \`docs/design-system.json\` 和 \`docs/design-system.md\` 是否存在
2. **如果不存在**：
   - ❌ **停止执行**
   - 提示用户：
     \`\`\`
     ⚠️  未找到设计系统文件
     
     请先运行以下命令生成设计系统：
     
     ui_design_system --product_type="SaaS" --stack="{framework}"
     
     然后保存生成的文件到 docs/ 目录：
     - design-system.json（机器可读的规范数据）
     - design-system.md（人类可读的设计指南）
     \`\`\`
   - 等待用户完成后再继续

3. **如果存在**：
   - ✅ **第一步：读取设计指南** \`docs/design-system.md\`
     - 理解设计理念和原则
     - 了解 UI 风格定位（如：专业、现代、简洁）
     - 查看配色方案说明（主色、辅色的使用场景）
     - 理解字体配对逻辑（标题用什么字体、正文用什么字体）
     - 学习间距系统规则（什么时候用大间距、小间距）
     - 查看反模式警告（避免什么样的设计）
     - 了解最佳实践建议
   
   - ✅ **第二步：读取规范数据** \`docs/design-system.json\`
     - 提取具体的设计规范值：
       - 主色: \`colors.primary.500\`
       - 辅色: \`colors.secondary.500\`
       - 中性色: \`colors.neutral.*\`
       - 字体: \`typography.fontFamily.sans\`
       - 间距: \`spacing.base\` 和 \`spacing.scale\`
       - 圆角: \`borderRadius.md\`
       - 阴影: \`shadows.md\`
   
   - 📖 **为什么要读两个文件？**
     - **design-system.md**: 提供设计上下文和使用指南，帮助 AI 理解"为什么这样设计"
     - **design-system.json**: 提供精确的数值，确保代码生成的准确性
     - **结合使用**: AI 既理解设计意图，又能准确应用规范
   
   - 继续执行

---

### 第2步：检查/生成组件目录 🔄

**操作**:
1. 检查文件 \`docs/component-catalog.json\` 是否存在
2. **如果不存在**：
   - 🔄 **自动生成**
   - 调用工具：
     \`\`\`json
     {
       "tool": "init_component_catalog"
     }
     \`\`\`
   - 等待生成完成
   - 保存到 \`docs/component-catalog.json\`

3. **如果存在**：
   - ✅ 读取 \`docs/component-catalog.json\`
   - 提取可用组件列表
   - 继续执行

---

### 第3步：搜索/生成 UI 模板 🔍

**操作**:
1. 调用 \`ui_search --mode=template --query="{description}"\`
2. **如果找到匹配模板**：
   - ✅ 使用现有模板
   - 读取模板 JSON
   - 跳到第4步

3. **如果没有找到**：
   - 🔄 **生成新模板**
   - 基于用户描述和组件目录生成 JSON 模板
   - 保存到 \`docs/ui/{templateName}.json\`

**生成模板的规则**:

根据用户描述，选择合适的组件组合：

**示例 1: 登录表单**
\`\`\`json
{
  "name": "LoginForm",
  "description": "登录表单页面",
  "layout": {
    "type": "Container",
    "props": { "maxWidth": "sm" },
    "children": [
      {
        "type": "Card",
        "props": { "title": "登录", "padding": "lg" },
        "children": [
          {
            "type": "Stack",
            "props": { "direction": "column", "spacing": 4 },
            "children": [
              {
                "type": "Input",
                "props": {
                  "label": "用户名",
                  "type": "text",
                  "placeholder": "请输入用户名",
                  "required": true
                }
              },
              {
                "type": "Input",
                "props": {
                  "label": "密码",
                  "type": "password",
                  "placeholder": "请输入密码",
                  "required": true
                }
              },
              {
                "type": "Button",
                "props": {
                  "variant": "primary",
                  "size": "lg",
                  "label": "登录"
                }
              }
            ]
          }
        ]
      }
    ]
  }
}
\`\`\`

**示例 2: 数据表格页面**
\`\`\`json
{
  "name": "DataTable",
  "description": "数据表格页面",
  "layout": {
    "type": "Container",
    "props": { "maxWidth": "xl" },
    "children": [
      {
        "type": "Card",
        "props": { "title": "用户列表" },
        "children": [
          {
            "type": "Table",
            "props": {
              "columns": [
                { "key": "name", "title": "姓名" },
                { "key": "email", "title": "邮箱" },
                { "key": "role", "title": "角色" }
              ],
              "striped": true,
              "hoverable": true
            }
          }
        ]
      }
    ]
  }
}
\`\`\`

**示例 3: 设置页面**
\`\`\`json
{
  "name": "SettingsPage",
  "description": "设置页面",
  "layout": {
    "type": "Container",
    "props": { "maxWidth": "lg" },
    "children": [
      {
        "type": "Grid",
        "props": { "cols": 1, "gap": 6 },
        "children": [
          {
            "type": "Card",
            "props": { "title": "个人信息" },
            "children": [
              {
                "type": "Form",
                "props": { "submitLabel": "保存" },
                "children": [
                  {
                    "type": "Input",
                    "props": { "label": "姓名", "type": "text" }
                  },
                  {
                    "type": "Input",
                    "props": { "label": "邮箱", "type": "email" }
                  }
                ]
              }
            ]
          },
          {
            "type": "Card",
            "props": { "title": "通知设置" },
            "children": [
              {
                "type": "Alert",
                "props": {
                  "variant": "info",
                  "message": "配置您的通知偏好"
                }
              }
            ]
          }
        ]
      }
    ]
  }
}
\`\`\`

**组件选择指南**:
- 表单类 → Card + Form + Input + Button
- 数据展示 → Card + Table
- 信息提示 → Alert
- 布局 → Container + Stack/Grid
- 弹窗 → Modal

---

### 第4步：渲染最终代码 🎨

**操作**:
1. 调用 \`render_ui\` 工具
   \`\`\`json
   {
     "tool": "render_ui",
     "args": {
       "template": "docs/ui/{templateName}.json",
       "framework": "{framework}"
     }
   }
   \`\`\`

2. 渲染引擎会：
   - 读取模板 JSON
   - 读取组件目录
   - 读取设计规范
   - 替换所有占位符
   - 生成最终代码

3. 输出完整的组件代码

---

## ✅ 完成汇总

向用户展示完成情况：

### 📊 执行摘要

| 步骤 | 状态 | 说明 |
|------|------|------|
| 设计指南 | ✅ | 已理解 design-system.md（设计理念） |
| 设计规范 | ✅ | 已应用 design-system.json（精确数值） |
| 组件目录 | ✅ | 已使用 component-catalog.json |
| UI 模板 | ✅ | 已生成/使用 {templateName}.json |
| 最终代码 | ✅ | 已生成 {framework} 代码 |

### 🎨 设计规范应用

生成的代码基于 **design-system.md** 的设计理念，并精确应用了 **design-system.json** 的规范值：

- ✅ **设计理念**: 遵循 design-system.md 中的 UI 风格定位和设计原则
- ✅ **颜色**: 使用 design-system.json 中的配色方案（主色、辅色、中性色）
- ✅ **字体**: 使用 design-system.json 中的字体系统（标题、正文、等宽）
- ✅ **间距**: 使用 design-system.json 中的间距比例（基准值和比例尺）
- ✅ **圆角**: 使用 design-system.json 中的圆角规范（sm/md/lg）
- ✅ **阴影**: 使用 design-system.json 中的阴影效果（sm/md/lg）
- ✅ **最佳实践**: 遵循 design-system.md 中的使用建议和反模式警告

**结果**: 整个项目样式完全统一，且符合设计理念 ✨

### 📁 生成的文件

- \`docs/ui/{templateName}.json\` - UI 模板（可复用）
- 组件代码（已输出，可直接使用）

### 🚀 下一步建议

1. **复制代码到项目**
   - 创建组件文件（如 \`src/components/{ComponentName}.tsx\`）
   - 粘贴生成的代码
   - 根据需求微调

2. **生成其他页面**
   - 使用 \`start_ui\` 生成其他页面
   - 所有页面将使用相同的设计规范
   - 保持项目样式统一

3. **自定义组件**
   - 如需自定义组件，可编辑 \`docs/component-catalog.json\`
   - 添加新组件定义
   - 重新运行 \`start_ui\`

---

## 💡 使用技巧

### 技巧 1：快速原型

\`\`\`bash
# 一键生成多个页面
start_ui "登录页面"
start_ui "注册页面"
start_ui "用户列表"
start_ui "设置页面"
\`\`\`

所有页面自动使用相同的设计规范！

### 技巧 2：修改设计规范

如果需要修改设计规范：

1. 编辑 \`docs/design-system.json\`
2. 修改颜色、字体等
3. 重新运行 \`start_ui\`
4. 所有页面自动应用新规范

### 技巧 3：保存模板

生成的模板保存在 \`docs/ui/\` 目录：
- 可以复用
- 可以修改
- 可以版本控制

---

## ⚠️ 常见问题

### Q1: 提示"未找到设计系统"

**解决方案**:
\`\`\`bash
# 先生成设计系统
ui_design_system --product_type="SaaS" --stack="{framework}"

# 保存两个文件到 docs/ 目录：
# 1. design-system.json（机器可读的规范数据）
# 2. design-system.md（人类可读的设计指南）
# 然后重新运行 start_ui
\`\`\`

**为什么需要两个文件？**
- **design-system.md**: 设计索引文档，包含设计理念、使用指南、最佳实践
- **design-system.json**: 精确的规范数值，供代码生成使用
- **配合使用**: AI 既理解设计意图，又能准确生成代码

### Q2: 生成的代码样式不对

**可能原因**:
- design-system.json 格式错误
- design-system.md 缺失或内容不完整
- component-catalog.json 占位符错误

**解决方案**:
1. 检查 design-system.json 和 design-system.md 是否都存在
2. 确保 design-system.md 包含完整的设计指南
3. 重新运行 \`ui_design_system\` 生成完整的设计系统
4. 重新运行 \`init_component_catalog\`
5. 重新运行 \`start_ui\`

### Q3: 想要自定义组件

**解决方案**:
1. 编辑 \`docs/component-catalog.json\`
2. 添加新组件定义
3. 使用占位符语法（\`{colors.primary.500}\`）
4. 重新运行 \`start_ui\`

### Q4: 如何修改设计理念？

**解决方案**:
1. 编辑 \`docs/design-system.md\` - 修改设计理念和指南
2. 编辑 \`docs/design-system.json\` - 修改具体的规范值
3. 重新运行 \`start_ui\` - 所有页面自动应用新规范

---

## 🔗 相关工具

- **ui_design_system**: 生成设计规范（必须先运行）
- **init_component_catalog**: 生成组件目录（自动调用）
- **ui_search**: 搜索模板（自动调用）
- **render_ui**: 渲染代码（自动调用）
- **genui**: 快速原型（不需要设计系统）

---

## ⚠️ 边界约束

- ❌ 仅输出代码，不自动创建文件
- ❌ 不执行代码或命令
- ✅ 自动编排整个流程
- ✅ 自动应用设计规范
- ✅ 保证样式统一
`;

/**
 * 统一 UI 开发编排工具
 */
export async function startUi(args: any) {
  try {
    // 智能参数解析
    const parsedArgs = parseArgs<{
      description?: string;
      framework?: string;
      template?: string;
    }>(args, {
      defaultValues: {
        description: "",
        framework: "react",
        template: "",
      },
      primaryField: "description",
      fieldAliases: {
        description: ["desc", "ui", "page", "需求", "描述"],
        framework: ["stack", "lib", "框架"],
        template: ["name", "模板名"],
      },
    });
    
    const description = getString(parsedArgs.description);
    const framework = getString(parsedArgs.framework) || "react";
    let templateName = getString(parsedArgs.template);
    
    // 如果没有提供模板名，从描述中生成
    if (!templateName && description) {
      // 简单的命名转换：登录页面 → login-page
      templateName = description
        .toLowerCase()
        .replace(/页面|表单|组件/g, '')
        .trim()
        .replace(/\s+/g, '-');
    }
    
    if (!description) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 缺少必要参数

**用法**:
\`\`\`
start_ui <描述> [--framework=react|vue|html]
\`\`\`

**示例**:
\`\`\`
start_ui "登录页面"
start_ui "用户列表" --framework=vue
start_ui "设置页面" --framework=react
\`\`\`

**提示**: 
- 确保已运行 \`ui_design_system\` 生成设计系统
- 组件目录会自动生成（如果不存在）
`,
          },
        ],
        isError: true,
      };
    }
    
    const guide = PROMPT_TEMPLATE
      .replace(/{description}/g, description)
      .replace(/{framework}/g, framework)
      .replace(/{templateName}/g, templateName || 'ui-template');
    
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
          text: `❌ UI 开发流程失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
