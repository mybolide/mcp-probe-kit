import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import { handleToolError } from "../utils/error-handler.js";
import type { CommitGuidance } from "../schemas/output/index.js";

const ALLOWED_TYPES: CommitGuidance["allowedTypes"] = [
  { type: "fixed", emoji: "🐛", when: "线上/测试缺陷修复" },
  { type: "fix", emoji: "🐛", when: "历史中也存在的兼容写法，语义同 fixed" },
  { type: "feat", emoji: "🎸", when: "新增或迭代业务功能" },
  { type: "docs", emoji: "✏️", when: "文档相关更新" },
  { type: "style", emoji: "💄", when: "UI/样式调整，无业务逻辑变更" },
  { type: "chore", emoji: "🤖", when: "构建、脚本、依赖等杂项" },
  { type: "refactor", emoji: "♻️", when: "重构、内部结构调整，不改变外部行为" },
  { type: "test", emoji: "✅", when: "测试相关" },
];

const EXAMPLES: CommitGuidance["examples"] = [
  {
    type: "feat",
    fullMessage: "feat: 🎸 添加用户登录功能\n\n影响模块: auth\n- 实现 JWT 认证机制\n- 添加密码加密存储\n- 实现登录失败重试限制\n\nCloses #123",
  },
  {
    type: "fixed",
    fullMessage: "fixed: 🐛 修复用户数据返回异常\n\n模块: api\n- 修复空值判断逻辑\n- 优化错误处理机制\n\nCloses #456",
  },
  {
    type: "chore",
    fullMessage: "chore: 🤖 升级依赖版本至 1.2.9",
  },
];

function summarizeChanges(changes: string): string {
  const compact = changes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("；");
  return compact.slice(0, 120);
}

function buildTextGuide(changes: string): string {
  const header = renderGuidanceHeader({
    tool: "gencommit",
    goal: "返回固定版 Git commit message 生成说明，指导 AI 严格按既定规则产出最终提交消息。",
    tasks: changes
      ? [
          "已提供变更内容：先分析变更，再按规范生成一条最终 commit message",
          "不要再次调用 gencommit，也不要声称工具输出为空",
        ]
      : [
          "未提供变更内容：先提示补充 git diff / git diff --staged 或一句话变更说明",
          "拿到变更内容后再按规范生成最终 commit message",
        ],
    outputs: ["一份规范说明文档，供 AI 直接据此写出最终 commit message"],
  });

  return `${header}请按以下规则生成 Git commit message：

**定位**
- 本工具返回的是说明文档，不是最终 commit message
- AI 必须根据本说明和变更内容，直接写出最终提交消息
- 不要重复调用 gencommit
- 不要说“工具返回为空”
- 不要忽略本工具约定后自行发挥

**强约束**
- type 和 emoji 必须使用下方固定映射，不允许自创、不允许替换
- 如果语义接近多个 type，选择最贴近本次主要变更的一种，不输出多个候选
- 最终必须只输出一条 commit message 本体
- 除非用户明确要求，否则不要附加解释、分析过程、前缀说明、代码块外文本
- 如果缺少足够变更信息，先索取变更信息；不要猜测最终 commit message

**第一步：获取变更信息**
${changes ? `已提供变更内容：\n${changes}` : `
1. 执行 \`git status\` 查看修改文件
2. 执行 \`git diff\` 查看具体变更
3. 如有暂存文件，执行 \`git diff --staged\`
`}

**第二步：分析变更**
- 识别变更类型（新功能、修复、重构等）
- 选择对应 emoji
- 提炼一句中文 subject
- 如有必要，在 body 中说明影响模块、关键改动和原因

**第三步：输出最终 commit message**
- 直接输出最终结果
- 不要附加“根据 gencommit 规则生成如下”这类解释
- 不要输出多条候选，默认只给一条最合适的
- 不要自创新的 type 或 emoji
- 不要把示例原样复用到当前提交

**格式**
\`\`\`
<type>: <emoji> <subject>

<body>

<footer>
\`\`\`

**允许的 type**
${ALLOWED_TYPES.map((item) => `- ${item.type} ${item.emoji}: ${item.when}`).join("\n")}

**硬性规则**
1. type 后面加冒号和空格，再接 emoji
2. subject 使用中文，简洁明确，尽量不超过 50 字
3. body 可选，但有必要时应说明影响范围和关键改动
4. footer 可选，用于 issue / BREAKING CHANGE
5. 最终只输出 commit message 本体
6. 不允许使用固定映射之外的 type / emoji
7. \`fixed\` 与 \`fix\` 都可用，但语义都表示“修复”；若无兼容性要求，优先用 \`fixed\`
8. 若本次提交以文档、样式、测试、依赖调整为主，不要误用 \`feat\` 或 \`fixed\`

**参考示例**
${EXAMPLES.map((item) => `\`\`\`gitcommit\n${item.fullMessage}\n\`\`\``).join("\n\n")}
`;
}

export async function gencommit(args: any) {
  try {
    const parsedArgs = parseArgs<{
      input?: string;
      changes?: string;
      type?: string;
    }>(args, {
      defaultValues: {
        input: "",
        changes: "",
        type: "",
      },
      primaryField: "input",
      fieldAliases: {
        input: ["输入"],
        changes: ["change", "diff", "code", "修改", "变更"],
        type: ["commit_type", "类型"],
      },
    });

    const input = getString(parsedArgs.input);
    const changes = getString(parsedArgs.changes) || input;

    const structured: CommitGuidance = {
      mode: "guidance",
      status: changes ? "ready" : "needs_changes",
      hasChanges: Boolean(changes),
      inputSummary: changes ? summarizeChanges(changes) : undefined,
      steps: changes
        ? [
            "分析提供的变更内容，判断最合适的 type 与 emoji",
            "提炼一条中文 subject，必要时补充 body/footer",
            "直接输出唯一一条最终 commit message，不要再调用 gencommit",
          ]
        : [
            "先向用户要 git diff / git diff --staged 或一句话变更说明",
            "拿到变更内容后按本说明生成最终 commit message",
          ],
      rules: [
        "gencommit 返回的是说明文档，不是最终 commit message",
        "AI 必须基于说明文档和变更内容直接生成最终提交消息",
        "不要声称工具输出为空",
        "不要再次调用 gencommit",
        "最终只输出一条最合适的 commit message",
        "type 和 emoji 必须使用固定映射，不允许自创",
        "若无兼容性要求，修复类提交优先使用 fixed",
      ],
      allowedTypes: ALLOWED_TYPES,
      outputTemplate: "<type>: <emoji> <subject>\n\n<body>\n\n<footer>",
      examples: EXAMPLES,
      nextAction: changes
        ? "现在根据上述固定规则直接写出唯一一条最终 commit message。"
        : "先补充变更内容，再根据上述固定规则写出唯一一条最终 commit message。",
    };

    return okStructured(buildTextGuide(changes), structured, {
      schema: (await import("../schemas/structured-output.js")).CommitGuidanceSchema,
      note: "本工具只返回固定提交规范说明。AI 必须严格复用既定 type/emoji 映射生成最终 commit message，不得重复调用 gencommit 或声称结果为空。",
    });
  } catch (error) {
    return handleToolError(error, "gencommit");
  }
}
