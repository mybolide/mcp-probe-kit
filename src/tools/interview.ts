/**
 * interview - 需求访谈工具
 * 在开发前通过结构化访谈澄清需求，避免理解偏差
 * 生成访谈记录文件，供后续 start_feature/add_feature 使用
 */

import { parseArgs } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import type { InterviewReport } from "../schemas/output/product-design-tools.js";

// 访谈问题模板（仅支持 feature 类型）
const FEATURE_INTERVIEW_TEMPLATE = {
  title: "新功能需求访谈",
  description: "通过结构化提问，帮助澄清功能需求，避免理解偏差和返工",
  phases: [
    {
      name: "背景理解",
      questions: [
        {
          id: "pain_point",
          question: "这个功能要解决什么问题？用户的痛点是什么？",
          required: true,
          placeholder: "例如：用户需要频繁登录，体验不好",
        },
        {
          id: "target_users",
          question: "目标用户是谁？他们的使用场景是什么？",
          required: true,
          placeholder: "例如：C端用户，在移动端和PC端使用",
        },
        {
          id: "business_driver",
          question: "为什么现在需要这个功能？有什么业务驱动因素吗？",
          required: false,
          placeholder: "例如：竞品都有，用户反馈强烈",
        },
      ],
    },
    {
      name: "功能边界",
      questions: [
        {
          id: "core_value",
          question: "这个功能的核心价值是什么？（用一句话描述）",
          required: true,
          placeholder: "例如：让用户能够安全便捷地访问系统",
        },
        {
          id: "scope_include",
          question: "功能范围包括哪些？",
          required: true,
          placeholder: "例如：邮箱登录、手机号登录、记住我、忘记密码",
        },
        {
          id: "scope_exclude",
          question: "功能范围不包括哪些？（明确边界）",
          required: false,
          placeholder: "例如：不包括第三方登录、不包括多因素认证",
        },
        {
          id: "input_output",
          question: "预期的输入和输出是什么？",
          required: false,
          placeholder: "例如：输入用户名密码，输出JWT token",
        },
      ],
    },
    {
      name: "技术约束",
      questions: [
        {
          id: "tech_stack",
          question: "有什么技术栈或框架的限制吗？",
          required: false,
          placeholder: "例如：必须使用 React + TypeScript",
        },
        {
          id: "performance",
          question: "性能要求是什么？（响应时间、并发量等）",
          required: false,
          placeholder: "例如：登录响应时间 < 500ms，支持1000并发",
        },
        {
          id: "compatibility",
          question: "需要考虑哪些兼容性问题？",
          required: false,
          placeholder: "例如：兼容 IE11、Safari、微信浏览器",
        },
        {
          id: "security",
          question: "有安全或合规要求吗？",
          required: false,
          placeholder: "例如：密码加密存储、防暴力破解、GDPR合规",
        },
      ],
    },
    {
      name: "验收标准",
      questions: [
        {
          id: "success_criteria",
          question: "如何判断这个功能是成功的？",
          required: true,
          placeholder: "例如：用户能够成功登录，登录成功率 > 99%",
        },
        {
          id: "test_scenarios",
          question: "有哪些关键的测试场景？",
          required: false,
          placeholder: "例如：正常登录、密码错误、账号不存在、网络异常",
        },
        {
          id: "metrics",
          question: "上线后如何衡量效果？",
          required: false,
          placeholder: "例如：登录成功率、登录耗时、用户留存率",
        },
      ],
    },
  ],
};

// 辅助函数：从描述中提取功能名称
function extractFeatureName(description: string): string {
  // 移除常见的前缀词
  let name = description
    .toLowerCase()
    .replace(/^(实现|开发|做|创建|添加|新增|构建)\s*/g, "")
    .replace(/功能$/, "")
    .trim();
  
  // 转换为 kebab-case
  name = name
    .replace(/[\s_]+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .slice(0, 50);
  
  return name || "new-feature";
}

// 生成访谈问题列表
function generateInterviewQuestions(featureName: string): string {
  const lines: string[] = [];
  const template = FEATURE_INTERVIEW_TEMPLATE;

  lines.push(
    renderGuidanceHeader({
      tool: "interview",
      goal: "通过结构化访谈澄清功能需求，减少返工。",
      tasks: ["逐条回答以下问题（必答/可选已标注）"],
      outputs: ["完整的访谈答复"],
    })
  );
  lines.push("# 📋 需求访谈 - 新功能开发");
  lines.push("");
  lines.push("**核心理念**: 先慢下来，把问题想清楚，反而能更快地交付正确的解决方案。");
  lines.push("");
  lines.push(`**功能名称**: \`${featureName}\``);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 📝 访谈说明");
  lines.push("");
  lines.push("请回答以下问题，帮助我们更好地理解你的需求：");
  lines.push("");
  lines.push("- **[必答]** 标记的问题请务必回答");
  lines.push("- **[可选]** 标记的问题可以跳过或回答\"不确定\"");
  lines.push("- 你可以一次性回答所有问题，也可以分批回答");
  lines.push("- 回答越详细，生成的需求文档越准确");
  lines.push("");
  lines.push("---");
  lines.push("");

  let questionNumber = 1;
  
  for (const phase of template.phases) {
    lines.push(`## ${phase.name}`);
    lines.push("");
    
    for (const q of phase.questions) {
      const required = q.required ? "**[必答]**" : "_[可选]_";
      lines.push(`### Q${questionNumber}. ${q.question} ${required}`);
      lines.push("");
      
      if (q.placeholder) {
        lines.push(`_提示: ${q.placeholder}_`);
        lines.push("");
      }
      
      lines.push("**你的回答**:");
      lines.push("");
      lines.push("");
      lines.push("");
      
      questionNumber++;
    }
    
    lines.push("---");
    lines.push("");
  }

  lines.push("## 💡 下一步");
  lines.push("");
  lines.push("回答完问题后，我会：");
  lines.push("1. 生成访谈记录文件 `docs/interviews/${featureName}-interview.md`");
  lines.push("2. 你可以选择：");
  lines.push(`   - 立即开发: \`start_feature --from-interview ${featureName}\``);
  lines.push(`   - 生成规格: \`add_feature --from-interview ${featureName}\``);
  lines.push("   - 稍后再说: 访谈记录已保存，随时可用");
  lines.push("");
  lines.push("**请开始回答上面的问题吧！**");

  return lines.join("\n");
}

function buildQuestionList() {
  const questions: Array<{
    id: string;
    question: string;
    required?: boolean;
    placeholder?: string;
  }> = [];

  for (const phase of FEATURE_INTERVIEW_TEMPLATE.phases) {
    for (const q of phase.questions) {
      questions.push({
        id: q.id,
        question: q.question,
        required: q.required,
        placeholder: q.placeholder,
      });
    }
  }

  return questions;
}

type InterviewQuestion = ReturnType<typeof buildQuestionList>[number];

interface DescriptionAssessment {
  readyForSpec: boolean;
  recognizedConstraints: string[];
  assumptions: string[];
  missingQuestionIds: string[];
}

function assessDescription(description: string): DescriptionAssessment {
  const recognizedConstraints: string[] = [];
  const assumptions: string[] = [];
  const signals = new Set<string>();

  if (/只读|仅查看|只展示/i.test(description)) {
    signals.add('read-only');
    recognizedConstraints.push('功能为只读展示');
  }
  if (/不(?:允许|得)?修改|禁止修改|不改变系统状态/i.test(description)) {
    signals.add('no-mutation');
    recognizedConstraints.push('不得修改系统状态');
  }
  if (/展示|显示|包含|包括|返回/i.test(description)) {
    signals.add('scope');
    recognizedConstraints.push(`功能范围已描述：${description}`);
  }
  if (/版本|工具数量|Memory|Git|计划状态|状态/i.test(description)) {
    signals.add('data-fields');
    recognizedConstraints.push('展示字段或数据来源已明确');
  }
  if (/接口失败|请求失败|失败时|错误|异常/i.test(description)) {
    signals.add('error-state');
    recognizedConstraints.push('失败时必须显示明确错误');
  }
  if (/移动端|桌面端|响应式|横向溢出/i.test(description)) {
    signals.add('responsive');
    recognizedConstraints.push('包含桌面端或移动端适配要求');
  }
  if (/不要求登录|无需登录|免登录|匿名访问/i.test(description)) {
    signals.add('auth-boundary');
    recognizedConstraints.push('不要求登录');
  }
  if (/不引入新依赖|零依赖|不新增依赖/i.test(description)) {
    signals.add('dependency-boundary');
    recognizedConstraints.push('不得引入新依赖');
  }
  if (/验收|必须|不得|应当|无横向溢出|正确显示/i.test(description)) {
    signals.add('acceptance');
  }
  if (/用户|开发者|维护人员|运维|管理员|访客/i.test(description)) {
    signals.add('target-users');
  }
  if (/解决|痛点|问题|避免|方便|快速/i.test(description)) {
    signals.add('pain-point');
  }

  const readyForSpec = description.trim().length >= 45 && signals.size >= 5;
  const missingQuestionIds: string[] = [];

  if (!signals.has('pain-point')) missingQuestionIds.push('pain_point');
  if (!signals.has('target-users')) missingQuestionIds.push('target_users');
  if (!signals.has('scope')) missingQuestionIds.push('scope_include');
  if (!signals.has('acceptance') && !signals.has('error-state')) {
    missingQuestionIds.push('success_criteria');
  }
  if (!signals.has('data-fields')) missingQuestionIds.push('input_output');
  if (!signals.has('auth-boundary')) missingQuestionIds.push('security');

  if (readyForSpec) {
    if (!signals.has('target-users')) {
      assumptions.push('目标用户未明确，规格草案暂按当前项目的开发与维护人员处理');
    }
    if (!signals.has('pain-point')) {
      assumptions.push('业务痛点未单独描述，规格草案暂按“快速识别当前系统健康状态”处理');
    }
  }

  return {
    readyForSpec,
    recognizedConstraints: [...new Set(recognizedConstraints)],
    assumptions,
    missingQuestionIds: readyForSpec ? [] : [...new Set(missingQuestionIds)].slice(0, 6),
  };
}

function buildFocusedQuestions(ids: string[]): InterviewQuestion[] {
  const byId = new Map(buildQuestionList().map((question) => [question.id, question]));
  return ids
    .map((id) => byId.get(id))
    .filter((question): question is InterviewQuestion => Boolean(question));
}

function generateFocusedInterview(
  featureName: string,
  description: string,
  assessment: DescriptionAssessment,
  questions: InterviewQuestion[],
): string {
  const lines: string[] = [];
  lines.push(renderGuidanceHeader({
    tool: 'interview',
    goal: assessment.readyForSpec
      ? '整理已明确约束并直接进入规格草案。'
      : '只追问描述中尚未明确的关键需求。',
    tasks: assessment.readyForSpec
      ? ['核对已识别约束与默认假设', '进入 check_spec 或 start_feature']
      : ['只回答下列缺失项，不重复已给信息'],
    outputs: [assessment.readyForSpec ? '可进入规格的需求摘要' : '聚焦后的补充问题'],
  }));
  lines.push(`# 需求访谈 - ${featureName}`, '');
  lines.push('## 已提供的需求', '', description, '');

  if (assessment.recognizedConstraints.length > 0) {
    lines.push('## 已识别约束', '');
    for (const item of assessment.recognizedConstraints) lines.push(`- ${item}`);
    lines.push('');
  }

  if (assessment.readyForSpec) {
    if (assessment.assumptions.length > 0) {
      lines.push('## 默认假设（可在规格中修改）', '');
      for (const assumption of assessment.assumptions) lines.push(`- ${assumption}`);
      lines.push('');
    }
    lines.push(
      '## 结论', '',
      '当前信息已足以形成规格草案，不再重复进行全量访谈。', '',
      '下一步：使用 `check_spec` 整理并校验规格，或由 `start_feature` 进入功能流程。',
    );
    return lines.join('\n');
  }

  lines.push('## 仍需补充', '');
  questions.forEach((question, index) => {
    lines.push(
      `### Q${index + 1}. ${question.question} ${question.required ? '**[必答]**' : '_[可选]_'}`,
      question.placeholder ? `_${question.placeholder}_` : '',
      '',
    );
  });
  lines.push('只需回答以上缺失项；已给出的范围和约束不会再次询问。');
  return lines.join('\n');
}

// 生成访谈记录文件内容
function generateInterviewRecord(
  featureName: string,
  answers: Record<string, string>
): string {
  const lines: string[] = [];
  const template = FEATURE_INTERVIEW_TEMPLATE;
  const timestamp = new Date().toISOString().split("T")[0];

  lines.push(`# 功能访谈记录 - ${featureName}`);
  lines.push("");
  lines.push(`**访谈时间**: ${timestamp}`);
  lines.push(`**功能名称**: ${featureName}`);
  lines.push(`**访谈类型**: feature`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const phase of template.phases) {
    lines.push(`## ${phase.name}`);
    lines.push("");
    
    for (const q of phase.questions) {
      lines.push(`### ${q.question}`);
      lines.push("");
      const answer = answers[q.id] || "_未提供_";
      lines.push(answer);
      lines.push("");
    }
    
    lines.push("---");
    lines.push("");
  }

  lines.push("## AI 总结");
  lines.push("");
  lines.push("基于以上访谈，AI 理解的需求摘要：");
  lines.push("");
  lines.push("**核心功能**: " + (answers.core_value || "待补充"));
  lines.push("");
  lines.push("**目标用户**: " + (answers.target_users || "待补充"));
  lines.push("");
  lines.push("**功能范围**:");
  lines.push("- 包括: " + (answers.scope_include || "待补充"));
  lines.push("- 不包括: " + (answers.scope_exclude || "待补充"));
  lines.push("");
  lines.push("**关键约束**:");
  if (answers.tech_stack) lines.push("- 技术栈: " + answers.tech_stack);
  if (answers.performance) lines.push("- 性能: " + answers.performance);
  if (answers.security) lines.push("- 安全: " + answers.security);
  if (!answers.tech_stack && !answers.performance && !answers.security) {
    lines.push("- 无特殊约束");
  }
  lines.push("");
  lines.push("**验收标准**: " + (answers.success_criteria || "待补充"));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 下一步");
  lines.push("");
  lines.push("**立即开发**:");
  lines.push("```");
  lines.push(`start_feature --from-interview ${featureName}`);
  lines.push("```");
  lines.push("");
  lines.push("**生成规格文档**:");
  lines.push("```");
  lines.push(`add_feature --from-interview ${featureName}`);
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("_由 MCP Probe Kit interview 工具生成_");

  return lines.join("\n");
}

export async function interview(args: any) {
  try {
    // 解析参数
    const parsed = parseArgs(args, {
      primaryField: "description",
      fieldAliases: {
        description: ["desc", "topic", "feature"],
        feature_name: ["featureName", "name"],
      },
    });
    const description = parsed.description || parsed.topic || "";
    const featureName = parsed.feature_name || parsed.featureName || "";
    const answers = parsed.answers as Record<string, string>;

    // 场景1: 无参数调用 - 显示使用说明
    if (!description && !featureName) {
      const header = renderGuidanceHeader({
        tool: "interview",
        goal: "在开发前澄清需求，形成可落盘的访谈记录。",
        tasks: [
          "提供功能描述以开始访谈",
          "或提交 answers 生成访谈记录",
        ],
        outputs: ["访谈问题列表或访谈记录文件"],
      });
      const text = `${header}# 📋 需求访谈工具

## 功能说明

在开发新功能前，通过结构化访谈澄清需求，避免理解偏差和返工。

**核心理念**: 先慢下来，把问题想清楚，反而能更快地交付正确的解决方案。

## 使用方法

### 开始访谈
\`\`\`
interview "实现用户登录功能"
interview --feature-name user-login "实现用户登录功能"
\`\`\`

### 提交访谈回答
\`\`\`
interview --feature-name user-login --answers {...}
\`\`\`

## 工作流程

\`\`\`
1. 用户: "我想做登录功能"
   ↓
2. AI 调用: interview "登录功能"
   ↓
3. 生成: 访谈问题列表（12-15个问题）
   ↓
4. 用户: 回答所有问题
   ↓
5. AI 生成: docs/interviews/user-login-interview.md
   ↓
6. 用户选择:
   - 立即开发: start_feature --from-interview user-login
   - 生成规格: add_feature --from-interview user-login
   - 稍后开发: 访谈记录已保存，随时可用
\`\`\`

## 访谈内容

访谈分为 4 个阶段，共 12-15 个问题：

1. **背景理解** - 痛点、用户、业务驱动
2. **功能边界** - 核心价值、范围、输入输出
3. **技术约束** - 技术栈、性能、兼容性、安全
4. **验收标准** - 成功标准、测试场景、效果衡量

## 为什么需要访谈？

- ✅ 澄清需求，避免理解偏差
- ✅ 发现隐藏的约束和依赖
- ✅ 减少返工，提高交付质量
- ✅ 形成清晰的需求文档

**先慢下来，反而能更快。**`;
      const structuredData: InterviewReport = {
        summary: "需求访谈工具使用说明",
        mode: "usage",
        content: text,
      };
      return okStructured(text, structuredData, {
        schema: (await import("../schemas/output/product-design-tools.js")).InterviewReportSchema,
      });
    }

    // 场景2: 开始访谈 - 生成问题列表
    if (description && !answers) {
      const name = featureName || extractFeatureName(description);
      const assessment = assessDescription(description);
      const focusedQuestions = buildFocusedQuestions(assessment.missingQuestionIds);
      const questions = generateFocusedInterview(name, description, assessment, focusedQuestions);
      const structuredData: InterviewReport = {
        summary: assessment.readyForSpec
          ? `需求已收敛，可进入规格：${name}`
          : `需求访谈缺失项：${name}`,
        mode: "questions",
        featureName: name,
        content: questions,
        questions: focusedQuestions,
        readyForSpec: assessment.readyForSpec,
        recognizedConstraints: assessment.recognizedConstraints,
        assumptions: assessment.assumptions,
        nextSteps: assessment.readyForSpec
          ? [
              `check_spec --feature-name ${name}`,
              `start_feature --feature-name ${name}`,
            ]
          : [
              "只回答 questions 中的缺失项并提交 answers",
              `interview --feature-name ${name} --answers {...}`,
            ],
      };
      return okStructured(questions, structuredData, {
        schema: (await import("../schemas/output/product-design-tools.js")).InterviewReportSchema,
      });
    }

    // 场景3: 提交回答 - 生成访谈记录
    if (answers && featureName) {
      const record = generateInterviewRecord(featureName, answers);
      const filePath = `docs/interviews/${featureName}-interview.md`;
      
      const lines: string[] = [];
      lines.push(
        renderGuidanceHeader({
          tool: "interview",
          goal: "生成可落盘的访谈记录并给出下一步选项。",
          tasks: ["按提示创建访谈记录文件", "选择下一步（start_feature / add_feature）"],
          outputs: ["访谈记录文件内容"],
        })
      );
      lines.push("# ✅ 访谈完成");
      lines.push("");
      lines.push("感谢你的详细回答！我已经整理好访谈记录。");
      lines.push("");
      lines.push("## 📄 请创建访谈记录文件");
      lines.push("");
      lines.push(`**文件路径**: \`${filePath}\``);
      lines.push("");
      lines.push("**文件内容**:");
      lines.push("");
      lines.push("```markdown");
      lines.push(record);
      lines.push("```");
      lines.push("");
      lines.push("---");
      lines.push("");
      lines.push("## 🚀 下一步");
      lines.push("");
      lines.push("访谈记录已生成，你可以选择：");
      lines.push("");
      lines.push("### 选项 1: 立即开始开发");
      lines.push("```");
      lines.push(`start_feature --from-interview ${featureName}`);
      lines.push("```");
      lines.push("这会：");
      lines.push("- 读取访谈记录");
      lines.push("- 生成完整的功能规格文档");
      lines.push("- 估算开发工作量");
      lines.push("");
      lines.push("### 选项 2: 只生成规格文档");
      lines.push("```");
      lines.push(`add_feature --from-interview ${featureName}`);
      lines.push("```");
      lines.push("这会：");
      lines.push("- 读取访谈记录");
      lines.push("- 生成功能规格文档");
      lines.push("- 不估算工作量");
      lines.push("");
      lines.push("### 选项 3: 稍后再说");
      lines.push("访谈记录已保存在 `docs/interviews/` 目录，随时可以使用。");
      lines.push("");
      lines.push("---");
      lines.push("");
      lines.push("💡 **提示**: 建议先创建访谈记录文件，然后再决定下一步。");
      
      const outputText = lines.join("\n");
      const structuredData: InterviewReport = {
        summary: `访谈记录已生成：${featureName}`,
        mode: "record",
        featureName,
        filePath,
        content: record,
        nextSteps: [
          `创建访谈记录文件：${filePath}`,
          `start_feature --from-interview ${featureName}`,
          `add_feature --from-interview ${featureName}`,
        ],
      };
      return okStructured(outputText, structuredData, {
        schema: (await import("../schemas/output/product-design-tools.js")).InterviewReportSchema,
      });
    }

    // 其他情况 - 错误提示
    const errorData: InterviewReport = {
      summary: "访谈失败",
      mode: "usage",
      content: "参数错误。请使用 `interview` 查看使用说明。",
    };
    return okStructured("❌ 参数错误。请使用 `interview` 查看使用说明。", errorData, {
      schema: (await import("../schemas/output/product-design-tools.js")).InterviewReportSchema,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorData: InterviewReport = {
      summary: "访谈失败",
      mode: "usage",
      content: errorMsg,
    };
    return okStructured(`❌ 访谈失败: ${errorMsg}`, errorData, {
      schema: (await import("../schemas/output/product-design-tools.js")).InterviewReportSchema,
    });
  }
}
