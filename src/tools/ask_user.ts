/**
 * ask_user - 向用户提问工具
 * 当 AI 需要更多信息时，可以主动向用户提问
 */

import { parseArgs } from "../utils/parseArgs.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import { okStructured } from "../lib/response.js";
import { handleToolError } from "../utils/error-handler.js";

interface Question {
  question: string;
  context?: string;
  options?: string[];
  required?: boolean;
}

export async function askUser(args: any) {
  try {
    const hasExplicitQuestion = Boolean(
      args
      && typeof args === 'object'
      && Object.prototype.hasOwnProperty.call(args, 'question')
    );
    // 解析参数
    const parsed = parseArgs(args, {
      primaryField: "question",
      fieldAliases: {
        question: ["q", "ask"],
      },
    });
    const question = parsed.question;
    const questions = parsed.questions as Question[];
    const context = parsed.context;
    const reason = parsed.reason;

    if (hasExplicitQuestion && (typeof question !== 'string' || !question.trim())) {
      throw new Error('参数 question 必须是非空字符串');
    }

    if (Array.isArray(questions)) {
      for (let i = 0; i < questions.length; i++) {
        const item = questions[i] as unknown;
        if (!item || typeof item !== 'object' || !String((item as { question?: unknown }).question ?? '').trim()) {
          throw new Error(`参数 questions[${i}].question 必须是非空字符串`);
        }
      }
    }

    if (!question && !questions) {
      const header = renderGuidanceHeader({
        tool: "ask_user",
        goal: "向用户提出关键问题，补全需求或做出决策。",
        tasks: ["按示例提供问题参数，或直接回答问题"],
        outputs: ["清晰的回答或可执行的参数"],
      });
      const text = `${header}# ❓ 向用户提问工具

## 使用方法

### 单个问题
\`\`\`
ask_user "你希望支持哪些支付方式？"
\`\`\`

### 多个问题
\`\`\`
ask_user --questions [
  { "question": "目标用户是谁？", "required": true },
  { "question": "预期的并发量是多少？", "required": true },
  { "question": "有预算限制吗？", "required": false }
]
\`\`\`

### 带上下文的问题
\`\`\`
ask_user "是否需要支持移动端？" --context "当前只有 PC 端实现"
\`\`\`

## 使用场景

- 需求不明确时主动澄清
- 技术方案选择需要用户决策
- 发现潜在风险需要确认
- 需要补充业务背景信息

## 最佳实践

1. **问题要具体** - 避免过于宽泛的问题
2. **提供上下文** - 说明为什么要问这个问题
3. **给出选项** - 如果有明确的选项，列出来
4. **标注重要性** - 区分必答和可选问题`;
      return okStructured(text, {
        question: "请提供 question 或 questions 参数",
        options: [],
        context: "ask_user 是 full 兼容工具；普通 Agent 可直接向用户提问",
        questions: [],
      });
    }

    const lines: string[] = [];

    lines.push(
      renderGuidanceHeader({
        tool: "ask_user",
        goal: "向用户确认关键问题，以便继续完成任务。",
        tasks: ["回答下面的问题（必答/可选已标注）"],
        outputs: ["逐条回答问题"],
      })
    );
    lines.push("# ❓ AI 需要向你确认一些信息");
    lines.push("");

    if (reason) {
      lines.push(`**提问原因**: ${reason}`);
      lines.push("");
    }

    if (context) {
      lines.push("## 背景信息");
      lines.push("");
      lines.push(context);
      lines.push("");
    }

    lines.push("## 问题");
    lines.push("");

    if (questions && questions.length > 0) {
      // 多个问题
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const required = q.required === true ? "**[必答]**" : "_[可选]_";
        
        lines.push(`### ${i + 1}. ${q.question} ${required}`);
        lines.push("");
        
        if (q.context) {
          lines.push(`_${q.context}_`);
          lines.push("");
        }
        
        if (q.options && q.options.length > 0) {
          lines.push("**可选项**:");
          for (const option of q.options) {
            lines.push(`- ${option}`);
          }
          lines.push("");
        }
        
        lines.push("**你的回答**: ");
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    } else if (question) {
      // 单个问题
      lines.push(`**${question}**`);
      lines.push("");
      lines.push("**你的回答**: ");
      lines.push("");
    }

    lines.push("---");
    lines.push("");
    lines.push("💡 **提示**: 请回答上述问题，我会根据你的回答继续工作。");

    const normalizedQuestions = Array.isArray(questions)
      ? questions.map((item) => ({
          question: String(item.question ?? ''),
          context: item.context ? String(item.context) : undefined,
          options: Array.isArray(item.options) ? item.options.map(String) : [],
          required: item.required === true,
        }))
      : [];
    const primaryQuestion = question
      ? String(question)
      : normalizedQuestions.map((item) => item.question).filter(Boolean).join('；');

    return okStructured(lines.join("\n"), {
      question: primaryQuestion,
      options: Array.isArray(parsed.options) ? parsed.options.map(String) : [],
      context: context ? String(context) : reason ? String(reason) : '',
      questions: normalizedQuestions,
    });
  } catch (error) {
    return handleToolError(error, 'ask_user');
  }
}
