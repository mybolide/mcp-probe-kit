/**
 * 初始化组件目录工具
 * 
 * 基于设计系统规范生成组件目录
 * 组件定义包含占位符，渲染时自动替换为实际值
 */

const PROMPT_TEMPLATE = `# 🎨 初始化组件目录

## 🎯 任务目标

基于设计系统规范（\`docs/design-system.json\`）生成组件目录文件。

**输出文件**: \`docs/component-catalog.json\`

**文件用途**: 定义可用的 UI 组件及其属性，供后续 UI 生成时使用。

---

## 📋 前置检查

### 第1步：检查设计系统文件

**操作**:
1. 检查文件 \`docs/design-system.json\` 是否存在
2. 如果不存在：
   - 提示用户先运行 \`ui_design_system\` 生成设计系统
   - 停止执行
3. 如果存在：
   - 读取文件内容
   - 提取设计规范（颜色、字体、间距等）

---

## 📝 生成组件目录

在 \`docs/component-catalog.json\` 中生成以下内容：

\`\`\`json
{
  "version": "1.0.0",
  "designSystem": "docs/design-system.json",
  "components": {
    "Button": {
      "description": "按钮组件",
      "props": {
        "variant": {
          "type": "enum",
          "values": ["primary", "secondary", "outline", "ghost", "link"],
          "default": "primary",
          "mapping": {
            "primary": "bg-[{colors.primary.500}] text-white hover:bg-[{colors.primary.600}]",
            "secondary": "bg-[{colors.secondary.500}] text-white hover:bg-[{colors.secondary.600}]",
            "outline": "border border-[{colors.neutral.300}] bg-transparent hover:bg-[{colors.neutral.50}]",
            "ghost": "hover:bg-[{colors.neutral.100}]",
            "link": "text-[{colors.primary.500}] underline-offset-4 hover:underline"
          }
        },
        "size": {
          "type": "enum",
          "values": ["sm", "md", "lg"],
          "default": "md",
          "mapping": {
            "sm": "h-9 px-3 text-sm",
            "md": "h-10 px-4 text-base",
            "lg": "h-11 px-6 text-lg"
          }
        },
        "label": {
          "type": "string",
          "required": true
        },
        "disabled": {
          "type": "boolean",
          "default": false
        }
      },
      "baseClasses": "inline-flex items-center justify-center rounded-[{borderRadius.md}] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[{colors.primary.500}] disabled:pointer-events-none disabled:opacity-50"
    },
    "Input": {
      "description": "输入框组件",
      "props": {
        "label": {
          "type": "string",
          "required": true
        },
        "type": {
          "type": "enum",
          "values": ["text", "email", "password", "number", "tel", "url"],
          "default": "text"
        },
        "placeholder": {
          "type": "string"
        },
        "required": {
          "type": "boolean",
          "default": false
        },
        "disabled": {
          "type": "boolean",
          "default": false
        },
        "error": {
          "type": "string"
        },
        "helperText": {
          "type": "string"
        }
      },
      "baseClasses": "w-full px-3 py-2 border border-[{colors.neutral.300}] rounded-[{borderRadius.md}] text-[{typography.fontSize.base}] focus:outline-none focus:ring-2 focus:ring-[{colors.primary.500}] focus:border-transparent disabled:bg-[{colors.neutral.50}] disabled:cursor-not-allowed"
    },
    "Card": {
      "description": "卡片容器",
      "props": {
        "title": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "padding": {
          "type": "enum",
          "values": ["none", "sm", "md", "lg"],
          "default": "md",
          "mapping": {
            "none": "p-0",
            "sm": "p-4",
            "md": "p-6",
            "lg": "p-8"
          }
        }
      },
      "hasChildren": true,
      "baseClasses": "bg-white rounded-[{borderRadius.lg}] shadow-[{shadows.md}] border border-[{colors.neutral.200}]"
    },
    "Form": {
      "description": "表单容器",
      "props": {
        "title": {
          "type": "string"
        },
        "submitLabel": {
          "type": "string",
          "default": "提交"
        },
        "cancelLabel": {
          "type": "string"
        }
      },
      "hasChildren": true,
      "baseClasses": "space-y-[{spacing.scale.4}]"
    },
    "Modal": {
      "description": "弹窗组件",
      "props": {
        "title": {
          "type": "string",
          "required": true
        },
        "size": {
          "type": "enum",
          "values": ["sm", "md", "lg", "xl"],
          "default": "md",
          "mapping": {
            "sm": "max-w-md",
            "md": "max-w-lg",
            "lg": "max-w-2xl",
            "xl": "max-w-4xl"
          }
        }
      },
      "hasChildren": true,
      "baseClasses": "relative bg-white rounded-[{borderRadius.lg}] shadow-[{shadows.xl}] w-full mx-4 max-h-[90vh] flex flex-col"
    },
    "Table": {
      "description": "数据表格",
      "props": {
        "columns": {
          "type": "array",
          "required": true
        },
        "striped": {
          "type": "boolean",
          "default": false
        },
        "hoverable": {
          "type": "boolean",
          "default": true
        }
      },
      "hasChildren": false,
      "baseClasses": "min-w-full divide-y divide-[{colors.neutral.200}]"
    },
    "Alert": {
      "description": "提示信息",
      "props": {
        "variant": {
          "type": "enum",
          "values": ["info", "success", "warning", "error"],
          "default": "info",
          "mapping": {
            "info": "bg-[{colors.primary.50}] text-[{colors.primary.700}] border-[{colors.primary.200}]",
            "success": "bg-[{colors.success.50}] text-[{colors.success.700}] border-[{colors.success.200}]",
            "warning": "bg-[{colors.warning.50}] text-[{colors.warning.700}] border-[{colors.warning.200}]",
            "error": "bg-[{colors.error.50}] text-[{colors.error.700}] border-[{colors.error.200}]"
          }
        },
        "title": {
          "type": "string"
        },
        "message": {
          "type": "string",
          "required": true
        }
      },
      "baseClasses": "p-4 rounded-[{borderRadius.md}] border"
    }
  },
  "layouts": {
    "Container": {
      "description": "容器布局",
      "props": {
        "maxWidth": {
          "type": "enum",
          "values": ["sm", "md", "lg", "xl", "2xl", "full"],
          "default": "lg",
          "mapping": {
            "sm": "max-w-screen-sm",
            "md": "max-w-screen-md",
            "lg": "max-w-screen-lg",
            "xl": "max-w-screen-xl",
            "2xl": "max-w-screen-2xl",
            "full": "max-w-full"
          }
        },
        "padding": {
          "type": "boolean",
          "default": true
        }
      },
      "hasChildren": true,
      "baseClasses": "mx-auto px-4"
    },
    "Stack": {
      "description": "堆叠布局",
      "props": {
        "direction": {
          "type": "enum",
          "values": ["row", "column"],
          "default": "column"
        },
        "spacing": {
          "type": "enum",
          "values": [2, 4, 6, 8],
          "default": 4,
          "mapping": {
            "2": "space-{direction === 'row' ? 'x' : 'y'}-2",
            "4": "space-{direction === 'row' ? 'x' : 'y'}-4",
            "6": "space-{direction === 'row' ? 'x' : 'y'}-6",
            "8": "space-{direction === 'row' ? 'x' : 'y'}-8"
          }
        },
        "align": {
          "type": "enum",
          "values": ["start", "center", "end", "stretch"],
          "default": "stretch"
        }
      },
      "hasChildren": true,
      "baseClasses": "flex"
    },
    "Grid": {
      "description": "网格布局",
      "props": {
        "cols": {
          "type": "enum",
          "values": [1, 2, 3, 4, 6, 12],
          "default": 1,
          "mapping": {
            "1": "grid-cols-1",
            "2": "grid-cols-2",
            "3": "grid-cols-3",
            "4": "grid-cols-4",
            "6": "grid-cols-6",
            "12": "grid-cols-12"
          }
        },
        "gap": {
          "type": "enum",
          "values": [2, 4, 6, 8],
          "default": 4,
          "mapping": {
            "2": "gap-2",
            "4": "gap-4",
            "6": "gap-6",
            "8": "gap-8"
          }
        }
      },
      "hasChildren": true,
      "baseClasses": "grid"
    }
  }
}
\`\`\`

---

## 🔑 关键说明

### 占位符语法

组件定义中使用占位符引用设计规范：

- \`{colors.primary.500}\` → 引用主色
- \`{colors.neutral.300}\` → 引用中性色
- \`{borderRadius.md}\` → 引用圆角
- \`{shadows.md}\` → 引用阴影
- \`{spacing.scale.4}\` → 引用间距
- \`{typography.fontSize.base}\` → 引用字体大小

**渲染时自动替换**：
\`\`\`
占位符: bg-[{colors.primary.500}]
替换后: bg-[#3b82f6]
\`\`\`

### 组件属性

每个组件包含：
- \`description\`: 组件描述
- \`props\`: 属性定义
  - \`type\`: 属性类型（string/boolean/enum/array）
  - \`values\`: 枚举值（仅 enum 类型）
  - \`default\`: 默认值
  - \`required\`: 是否必填
  - \`mapping\`: 值到样式的映射
- \`hasChildren\`: 是否可包含子组件
- \`baseClasses\`: 基础样式类（包含占位符）

---

## ✅ 验证清单

生成文件后，请验证：

- [ ] 文件已创建: \`docs/component-catalog.json\`
- [ ] JSON 格式正确（无语法错误）
- [ ] 包含所有基础组件（Button、Input、Card 等）
- [ ] 包含所有布局组件（Container、Stack、Grid）
- [ ] 所有占位符格式正确（\`{path.to.value}\`）
- [ ] 引用的设计规范路径正确

---

## 📌 注意事项

1. **依赖设计规范**: 必须先运行 \`ui_design_system\` 生成 \`design-system.json\`
2. **占位符一致性**: 确保占位符路径与 \`design-system.json\` 结构一致
3. **可扩展性**: 用户可以添加自定义组件到此文件
4. **版本控制**: 建议将此文件纳入 Git 版本控制

---

## 🚀 下一步

生成组件目录后，可以：

1. 使用 \`ui_search --mode=catalog\` 查看可用组件
2. 使用 \`ui_search --mode=template\` 获取 UI 模板
3. 使用 \`render_ui\` 渲染最终代码

**完整工作流**:
\`\`\`
ui_design_system → design-system.json
       ↓
init_component_catalog → component-catalog.json
       ↓
ui_search --mode=template → ui/template.json
       ↓
render_ui → 最终代码（自动应用设计规范）
\`\`\`
`;

/**
 * 初始化组件目录工具
 */
export async function initComponentCatalog(args: any) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // 检查设计系统文件是否存在
    const docsDir = path.join(process.cwd(), 'docs');
    const uiDir = path.join(docsDir, 'ui');
    const designSystemPath = path.join(docsDir, 'design-system.json');
    
    try {
      await fs.access(designSystemPath);
    } catch {
      return {
        content: [
          {
            type: "text",
            text: `❌ 未找到设计系统文件

请先运行 \`ui_design_system\` 生成设计系统：

\`\`\`
ui_design_system --product_type="SaaS" --stack="react"
\`\`\`

然后再运行此工具。
`,
          },
        ],
        isError: true,
      };
    }
    
    // 生成组件目录
    const componentCatalog = {
      version: "1.0.0",
      designSystem: "docs/design-system.json",
      components: {
        Button: {
          description: "按钮组件",
          props: {
            variant: {
              type: "enum",
              values: ["primary", "secondary", "outline", "ghost", "link"],
              default: "primary",
              mapping: {
                primary: "bg-[{colors.primary.500}] text-white hover:bg-[{colors.primary.600}]",
                secondary: "bg-[{colors.secondary.500}] text-white hover:bg-[{colors.secondary.600}]",
                outline: "border border-[{colors.neutral.300}] bg-transparent hover:bg-[{colors.neutral.50}]",
                ghost: "hover:bg-[{colors.neutral.100}]",
                link: "text-[{colors.primary.500}] underline-offset-4 hover:underline"
              }
            },
            size: {
              type: "enum",
              values: ["sm", "md", "lg"],
              default: "md",
              mapping: {
                sm: "h-9 px-3 text-sm",
                md: "h-10 px-4 text-base",
                lg: "h-11 px-6 text-lg"
              }
            },
            label: {
              type: "string",
              required: true
            },
            disabled: {
              type: "boolean",
              default: false
            }
          },
          baseClasses: "inline-flex items-center justify-center rounded-[{borderRadius.md}] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[{colors.primary.500}] disabled:pointer-events-none disabled:opacity-50"
        },
        Input: {
          description: "输入框组件",
          props: {
            label: {
              type: "string",
              required: true
            },
            type: {
              type: "enum",
              values: ["text", "email", "password", "number", "tel", "url"],
              default: "text"
            },
            placeholder: {
              type: "string"
            },
            required: {
              type: "boolean",
              default: false
            },
            disabled: {
              type: "boolean",
              default: false
            },
            error: {
              type: "string"
            },
            helperText: {
              type: "string"
            }
          },
          baseClasses: "w-full px-3 py-2 border border-[{colors.neutral.300}] rounded-[{borderRadius.md}] text-[{typography.fontSize.base}] focus:outline-none focus:ring-2 focus:ring-[{colors.primary.500}] focus:border-transparent disabled:bg-[{colors.neutral.50}] disabled:cursor-not-allowed"
        },
        Card: {
          description: "卡片容器",
          props: {
            title: {
              type: "string"
            },
            description: {
              type: "string"
            },
            padding: {
              type: "enum",
              values: ["none", "sm", "md", "lg"],
              default: "md",
              mapping: {
                none: "p-0",
                sm: "p-4",
                md: "p-6",
                lg: "p-8"
              }
            }
          },
          hasChildren: true,
          baseClasses: "bg-white rounded-[{borderRadius.lg}] shadow-[{shadows.md}] border border-[{colors.neutral.200}]"
        },
        Form: {
          description: "表单容器",
          props: {
            title: {
              type: "string"
            },
            submitLabel: {
              type: "string",
              default: "提交"
            },
            cancelLabel: {
              type: "string"
            }
          },
          hasChildren: true,
          baseClasses: "space-y-[{spacing.scale.4}]"
        },
        Modal: {
          description: "弹窗组件",
          props: {
            title: {
              type: "string",
              required: true
            },
            size: {
              type: "enum",
              values: ["sm", "md", "lg", "xl"],
              default: "md",
              mapping: {
                sm: "max-w-md",
                md: "max-w-lg",
                lg: "max-w-2xl",
                xl: "max-w-4xl"
              }
            }
          },
          hasChildren: true,
          baseClasses: "relative bg-white rounded-[{borderRadius.lg}] shadow-[{shadows.xl}] w-full mx-4 max-h-[90vh] flex flex-col"
        },
        Table: {
          description: "数据表格",
          props: {
            columns: {
              type: "array",
              required: true
            },
            striped: {
              type: "boolean",
              default: false
            },
            hoverable: {
              type: "boolean",
              default: true
            }
          },
          hasChildren: false,
          baseClasses: "min-w-full divide-y divide-[{colors.neutral.200}]"
        },
        Alert: {
          description: "提示信息",
          props: {
            variant: {
              type: "enum",
              values: ["info", "success", "warning", "error"],
              default: "info",
              mapping: {
                info: "bg-[{colors.primary.50}] text-[{colors.primary.700}] border-[{colors.primary.200}]",
                success: "bg-[{colors.success.50}] text-[{colors.success.700}] border-[{colors.success.200}]",
                warning: "bg-[{colors.warning.50}] text-[{colors.warning.700}] border-[{colors.warning.200}]",
                error: "bg-[{colors.error.50}] text-[{colors.error.700}] border-[{colors.error.200}]"
              }
            },
            title: {
              type: "string"
            },
            message: {
              type: "string",
              required: true
            }
          },
          baseClasses: "p-4 rounded-[{borderRadius.md}] border"
        }
      },
      layouts: {
        Container: {
          description: "容器布局",
          props: {
            maxWidth: {
              type: "enum",
              values: ["sm", "md", "lg", "xl", "2xl", "full"],
              default: "lg",
              mapping: {
                sm: "max-w-screen-sm",
                md: "max-w-screen-md",
                lg: "max-w-screen-lg",
                xl: "max-w-screen-xl",
                "2xl": "max-w-screen-2xl",
                full: "max-w-full"
              }
            },
            padding: {
              type: "boolean",
              default: true
            }
          },
          hasChildren: true,
          baseClasses: "mx-auto px-4"
        },
        Stack: {
          description: "堆叠布局",
          props: {
            direction: {
              type: "enum",
              values: ["row", "column"],
              default: "column"
            },
            spacing: {
              type: "enum",
              values: [2, 4, 6, 8],
              default: 4,
              mapping: {
                "2": "space-{direction === 'row' ? 'x' : 'y'}-2",
                "4": "space-{direction === 'row' ? 'x' : 'y'}-4",
                "6": "space-{direction === 'row' ? 'x' : 'y'}-6",
                "8": "space-{direction === 'row' ? 'x' : 'y'}-8"
              }
            },
            align: {
              type: "enum",
              values: ["start", "center", "end", "stretch"],
              default: "stretch"
            }
          },
          hasChildren: true,
          baseClasses: "flex"
        },
        Grid: {
          description: "网格布局",
          props: {
            cols: {
              type: "enum",
              values: [1, 2, 3, 4, 6, 12],
              default: 1,
              mapping: {
                "1": "grid-cols-1",
                "2": "grid-cols-2",
                "3": "grid-cols-3",
                "4": "grid-cols-4",
                "6": "grid-cols-6",
                "12": "grid-cols-12"
              }
            },
            gap: {
              type: "enum",
              values: [2, 4, 6, 8],
              default: 4,
              mapping: {
                "2": "gap-2",
                "4": "gap-4",
                "6": "gap-6",
                "8": "gap-8"
              }
            }
          },
          hasChildren: true,
          baseClasses: "grid"
        }
      }
    };
    
    // 确保 docs/ui 目录存在
    try {
      await fs.access(uiDir);
    } catch {
      await fs.mkdir(uiDir, { recursive: true });
    }
    
    // 写入文件到 docs/ui/
    const catalogPath = path.join(uiDir, 'component-catalog.json');
    await fs.writeFile(catalogPath, JSON.stringify(componentCatalog, null, 2), 'utf-8');
    
    // 统计组件数量
    const componentCount = Object.keys(componentCatalog.components).length;
    const layoutCount = Object.keys(componentCatalog.layouts).length;
    
    return {
      content: [
        {
          type: "text",
          text: `# ✅ 组件目录生成成功

## 📄 文件已保存

**文件**: \`docs/ui/component-catalog.json\`

---

## 📦 组件清单

### 基础组件（${componentCount} 个）
${Object.entries(componentCatalog.components).map(([name, comp]: [string, any]) => 
  `- **${name}**: ${comp.description}`
).join('\n')}

### 布局组件（${layoutCount} 个）
${Object.entries(componentCatalog.layouts).map(([name, layout]: [string, any]) => 
  `- **${name}**: ${layout.description}`
).join('\n')}

**总计**: ${componentCount + layoutCount} 个组件

---

## 🔑 占位符说明

组件样式使用占位符引用设计规范：

- \`{colors.primary.500}\` → 主色
- \`{colors.neutral.300}\` → 中性色
- \`{borderRadius.md}\` → 圆角
- \`{shadows.md}\` → 阴影
- \`{spacing.scale.4}\` → 间距
- \`{typography.fontSize.base}\` → 字体大小

**渲染时自动替换**：
\`\`\`
占位符: bg-[{colors.primary.500}]
替换后: bg-[#3b82f6]（从 design-system.json 读取）
\`\`\`

---

## 🚀 下一步

### 方式 1：一键生成 UI（推荐）

\`\`\`bash
start_ui "登录页面"
start_ui "用户列表"
start_ui "设置页面"
\`\`\`

所有页面将自动应用设计规范 ✨

### 方式 2：手动步骤

\`\`\`bash
# 第1步：查看组件目录
ui_search --mode=catalog

# 第2步：搜索 UI 模板
ui_search --mode=template --query="登录表单"

# 第3步：渲染代码
render_ui docs/ui/your-template.json
\`\`\`

---

## 💡 自定义组件

如需添加自定义组件：

1. 编辑 \`docs/ui/component-catalog.json\`
2. 添加新组件定义
3. 使用占位符语法（\`{path.to.value}\`）
4. 重新运行 \`start_ui\` 或 \`render_ui\`

**示例**：
\`\`\`json
{
  "components": {
    "MyButton": {
      "description": "自定义按钮",
      "props": {
        "color": {
          "type": "string",
          "default": "{colors.primary.500}"
        }
      },
      "baseClasses": "px-4 py-2 rounded-[{borderRadius.md}]"
    }
  }
}
\`\`\`
`,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ 初始化组件目录失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
