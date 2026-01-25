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

const PROMPT_TEMPLATE = `# 快速开始

**职责说明**: 本工具仅提供执行指导，不执行实际操作。请按顺序调用以下 MCP 工具。

执行以下工具：

1. 检查 \`docs/design-system.md\` 是否存在，不存在则调用 \`ui_design_system --product_type="SaaS" --stack="{framework}"\`
2. 检查 \`docs/component-catalog.json\` 是否存在，不存在则调用 \`init_component_catalog\`
3. \`ui_search --mode=template --query="{description}"\`
4. \`render_ui --template="docs/ui/{templateName}.json" --framework="{framework}"\`

---

## 步骤 1: 生成设计系统（如不存在）✅

**检查**: 查看 \`docs/design-system.md\` 是否存在

**如果不存在，调用工具**: \`ui_design_system\`
**参数**:
\`\`\`json
{
  "product_type": "SaaS",
  "stack": "{framework}"
}
\`\`\`

**预期输出**: \`docs/design-system.json\` 和 \`docs/design-system.md\`
**失败处理**: 检查 docs 目录是否存在，确保有写入权限

---

## 步骤 2: 生成组件目录（如不存在）🔄

**检查**: 查看 \`docs/component-catalog.json\` 是否存在

**如果不存在，调用工具**: \`init_component_catalog\`
**参数**: 无

**预期输出**: \`docs/component-catalog.json\`
**失败处理**: 确保步骤 1 的设计系统文件已生成

---

## 步骤 3: 搜索 UI 模板 🔍

**工具**: \`ui_search\`
**参数**:
\`\`\`json
{
  "mode": "template",
  "query": "{description}"
}
\`\`\`

**预期输出**: 匹配的模板列表（可能为空）
**失败处理**: 如果没有找到模板，继续到步骤 4 使用默认模板

---

## 步骤 4: 渲染最终代码 🎨

**工具**: \`render_ui\`
**参数**:
\`\`\`json
{
  "template": "docs/ui/{templateName}.json",
  "framework": "{framework}"
}
\`\`\`

**预期输出**: 完整的 {framework} 组件代码
**失败处理**: 如果模板不存在，工具会使用默认模板生成代码

---

## 高级选项

### 自定义设计系统
编辑 \`docs/design-system.json\` 修改颜色、字体等，然后重新运行。

### 自定义组件
编辑 \`docs/component-catalog.json\` 添加新组件定义。

### 常见问题

**Q: 设计系统文件已存在，还需要重新生成吗？**
A: 不需要。如果文件已存在，直接跳过步骤 1。

**Q: 如何使用自定义模板？**
A: 在 \`docs/ui/\` 目录创建 JSON 模板文件，然后在步骤 4 中指定模板路径。
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
      mode?: string;
    }>(args, {
      defaultValues: {
        description: "",
        framework: "react",
        template: "",
        mode: "manual",
      },
      primaryField: "description",
      fieldAliases: {
        description: ["desc", "ui", "page", "需求", "描述"],
        framework: ["stack", "lib", "框架"],
        template: ["name", "模板名"],
        mode: ["模式"],
      },
    });
    
    const description = getString(parsedArgs.description);
    const framework = getString(parsedArgs.framework) || "react";
    const mode = getString(parsedArgs.mode) || "manual";
    let templateName = getString(parsedArgs.template);
    
    // 验证 mode 参数
    const validModes = ["auto", "manual"];
    if (mode && !validModes.includes(mode)) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 无效的模式: ${mode}

**有效选项**: auto, manual

**示例**:
\`\`\`
start_ui "登录页面" --mode=manual
start_ui "用户列表" --mode=auto
\`\`\`
`,
          },
        ],
        isError: true,
      };
    }
    
    // 自动模式尚未实现
    if (mode === "auto") {
      return {
        content: [
          {
            type: "text",
            text: `⚠️ 自动模式尚未实现

自动模式将在未来版本中支持。目前请使用手动模式：

\`\`\`
start_ui "${description}" --mode=manual
\`\`\`

手动模式会返回详细的执行指导，您可以按步骤调用工具。
`,
          },
        ],
        isError: false,
      };
    }
    
    // 如果没有提供模板名，从描述中生成
    if (!templateName && description) {
      // 简单的命名转换：登录页面 → login-page
      // 移除特殊字符，只保留字母、数字、中文和连字符
      templateName = description
        .toLowerCase()
        .replace(/页面|表单|组件/g, '')
        .trim()
        .replace(/[^\w\u4e00-\u9fa5-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
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
    
    // 转义 JSON 字符串中的特殊字符
    const escapeJson = (str: string) => {
      return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    };
    
    // 安全的字符串替换，避免 $& 等特殊字符被解释为替换模式
    const safeReplace = (template: string, placeholder: string, value: string) => {
      return template.split(placeholder).join(value);
    };
    
    let guide = PROMPT_TEMPLATE;
    guide = safeReplace(guide, '{description}', escapeJson(description));
    guide = safeReplace(guide, '{framework}', framework);
    guide = safeReplace(guide, '{templateName}', templateName || 'ui-template');
    
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
