import { parseArgs, getString } from "../utils/parseArgs.js";

/**
 * start_feature 智能编排工具
 * 
 * 场景：开发新功能
 * 编排：[检查上下文] → add_feature → estimate
 */

/**
 * 从自然语言输入中提取功能名和描述
 * @param input - 自然语言输入
 * @returns 提取的功能名和描述
 */
function extractFeatureInfo(input: string): { name: string; description: string } {
  // 移除常见的引导词
  let text = input
    .replace(/^(添加|实现|开发|创建|新增|生成|构建|做|要|想要|需要|帮我|请|麻烦)/i, "")
    .trim();
  
  // 移除结尾的"功能"、"模块"等词
  text = text.replace(/(功能|模块|特性|组件|系统|服务)$/i, "").trim();
  
  // 如果文本很短（少于20个字符），直接作为功能名
  if (text.length < 20) {
    const name = text
      .toLowerCase()
      .replace(/[\s\u4e00-\u9fa5]+/g, "-") // 将空格和中文替换为连字符
      .replace(/[^a-z0-9-]/g, "") // 移除非字母数字和连字符
      .replace(/-+/g, "-") // 合并多个连字符
      .replace(/^-|-$/g, ""); // 移除首尾连字符
    
    return {
      name: name || "new-feature",
      description: input,
    };
  }
  
  // 如果文本较长，尝试提取关键词作为功能名
  // 提取前几个关键词
  const words = text.split(/[\s,，、]+/).filter(w => w.length > 0);
  const keyWords = words.slice(0, 3).join(" ");
  
  const name = keyWords
    .toLowerCase()
    .replace(/[\s\u4e00-\u9fa5]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  
  return {
    name: name || "new-feature",
    description: input,
  };
}

const PROMPT_TEMPLATE = `# 🚀 新功能开发编排指南

## 🎯 目标

开发新功能：**{feature_name}**

**功能描述**: {description}

---

## 📋 步骤 0: 项目上下文（自动处理）

**操作**:
1. 检查 \`{docs_dir}/project-context.md\` 是否存在
2. **如果不存在**：
   - 调用 \`init_project_context\` 工具
   - 参数: \`{ "docs_dir": "{docs_dir}" }\`
   - 等待生成完成
3. **读取** \`{docs_dir}/project-context.md\` 内容
4. 提取关键信息：技术栈、架构模式、编码规范
5. 后续所有步骤都要参考此上下文

---

## 🚀 步骤 1: 生成功能规格

**调用工具**: \`add_feature\`

**参数**:
\`\`\`json
{
  "feature_name": "{feature_name}",
  "description": "{description}",
  "docs_dir": "{docs_dir}"
}
\`\`\`

**预期输出**:
- \`{docs_dir}/specs/{feature_name}/requirements.md\` - 需求文档
- \`{docs_dir}/specs/{feature_name}/design.md\` - 设计文档
- \`{docs_dir}/specs/{feature_name}/tasks.md\` - 任务清单

**注意**: 生成文档时要参考项目上下文中的技术栈和架构模式

---

## 📊 步骤 2: 工作量估算

**调用工具**: \`estimate\`

**参数**:
\`\`\`json
{
  "task_description": "实现 {feature_name} 功能：{description}",
  "code_context": "参考生成的 tasks.md 中的任务列表"
}
\`\`\`

**预期输出**:
- 故事点估算
- 时间估算（乐观/正常/悲观）
- 复杂度分析
- 风险识别

---

## ✅ 完成检查

- [ ] 项目上下文已读取/生成
- [ ] requirements.md 已生成
- [ ] design.md 已生成
- [ ] tasks.md 已生成
- [ ] 工作量估算已完成

---

## 📝 输出汇总

完成后，向用户汇总：

1. **功能规格文档位置**: \`{docs_dir}/specs/{feature_name}/\`
2. **预估工作量**: X 故事点 / X-X 天
3. **主要风险**: [列出识别的风险]
4. **下一步**: 按 tasks.md 开始开发

---

*编排工具: MCP Probe Kit - start_feature*
`;

export async function startFeature(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      feature_name?: string;
      description?: string;
      docs_dir?: string;
      input?: string;
    }>(args, {
      defaultValues: {
        feature_name: "",
        description: "",
        docs_dir: "docs",
      },
      primaryField: "input", // 纯文本输入默认映射到 input 字段
      fieldAliases: {
        feature_name: ["name", "feature", "功能名", "功能名称"],
        description: ["desc", "requirement", "描述", "需求"],
        docs_dir: ["dir", "output", "目录", "文档目录"],
      },
    });

    let featureName = getString(parsedArgs.feature_name);
    let description = getString(parsedArgs.description);
    const docsDir = getString(parsedArgs.docs_dir) || "docs";

    // 如果是纯自然语言输入（input 字段有值但 feature_name 和 description 为空）
    const input = getString(parsedArgs.input);
    if (input && !featureName && !description) {
      // 智能提取功能名和描述
      const extracted = extractFeatureInfo(input);
      featureName = extracted.name;
      description = extracted.description;
    }

    // 如果只有 description 没有 feature_name，尝试从 description 提取
    if (!featureName && description) {
      const extracted = extractFeatureInfo(description);
      featureName = extracted.name;
      if (!description || description === featureName) {
        description = extracted.description;
      }
    }

    if (!featureName || !description) {
      throw new Error(
        "请提供功能名称和描述。\n\n" +
        "示例用法：\n" +
        "- 自然语言：'开发用户认证功能'\n" +
        "- 详细描述：'实现用户登录、注册和密码重置功能'\n" +
        "- JSON格式：{\"feature_name\": \"user-auth\", \"description\": \"用户认证功能\"}"
      );
    }

    const guide = PROMPT_TEMPLATE
      .replace(/{feature_name}/g, featureName)
      .replace(/{description}/g, description)
      .replace(/{docs_dir}/g, docsDir);

    return {
      content: [{ type: "text", text: guide }],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ 编排执行失败: ${errorMsg}` }],
      isError: true,
    };
  }
}
