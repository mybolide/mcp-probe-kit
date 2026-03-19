import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type SkillBridgeWorkflow = "start_ui" | "start_product";

interface SkillDefinition {
  name: string;
  role: string;
  appliesTo: SkillBridgeWorkflow[];
}

export interface SkillBridgeItem {
  name: string;
  role: string;
  installed: boolean;
  skillPath?: string;
  expectedPaths: string[];
}

export interface SkillBridgeStatus {
  workflow: SkillBridgeWorkflow;
  generatedAt: string;
  installedCount: number;
  missingCount: number;
  ready: boolean;
  skills: SkillBridgeItem[];
}

const SKILL_DEFINITIONS: SkillDefinition[] = [
  {
    name: "ui-ux-pro-max",
    role: "设计系统与风格策略推荐",
    appliesTo: ["start_ui", "start_product"],
  },
  {
    name: "interaction-design",
    role: "交互状态与流程约束",
    appliesTo: ["start_ui", "start_product"],
  },
  {
    name: "frontend-design",
    role: "前端视觉与代码实现增强",
    appliesTo: ["start_ui", "start_product"],
  },
];

function buildSkillRoots(): string[] {
  const fromEnv = (process.env.MCP_SKILLS_ROOTS || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);

  const home = os.homedir();
  const defaults = [
    path.join(home, ".agents", "skills"),
    path.join(home, ".codex", "skills"),
    path.join(home, ".codex", "skills", ".system"),
  ];

  return Array.from(new Set([...fromEnv, ...defaults]));
}

function resolveSkill(name: string, roots: string[]): SkillBridgeItem {
  const expectedPaths = roots.map((root) => path.join(root, name, "SKILL.md"));
  const installedPath = expectedPaths.find((candidate) => fs.existsSync(candidate));

  return {
    name,
    role: SKILL_DEFINITIONS.find((item) => item.name === name)?.role || "",
    installed: Boolean(installedPath),
    skillPath: installedPath,
    expectedPaths,
  };
}

export function detectSkillBridge(workflow: SkillBridgeWorkflow): SkillBridgeStatus {
  const roots = buildSkillRoots();
  const selected = SKILL_DEFINITIONS.filter((item) => item.appliesTo.includes(workflow));
  const skills = selected.map((item) => resolveSkill(item.name, roots));
  const installedCount = skills.filter((item) => item.installed).length;
  const missingCount = skills.length - installedCount;

  return {
    workflow,
    generatedAt: new Date().toISOString(),
    installedCount,
    missingCount,
    ready: missingCount === 0,
    skills,
  };
}

export function buildSkillHeaderNote(status: SkillBridgeStatus): string {
  return `Skill Bridge: ${status.installedCount}/${status.skills.length} 可用`;
}

export function buildSkillBridgePlanStep(status: SkillBridgeStatus) {
  return {
    id: "skill-bridge",
    tool: "manual",
    action: "invoke_skills",
    when: "在宿主支持 skill 调用时优先执行",
    args: {
      order: status.skills.map((item) => item.name),
      available: status.skills.filter((item) => item.installed).map((item) => item.name),
      missing: status.skills.filter((item) => !item.installed).map((item) => item.name),
    },
    outputs: [],
  };
}

export function renderSkillBridgeSection(status: SkillBridgeStatus): string {
  const orderLines = status.skills
    .map((item, index) => `${index + 1}. \`${item.name}\` - ${item.role}`)
    .join("\n");

  const stateLines = status.skills
    .map((item) => `- ${item.name}: ${item.installed ? `已安装（${item.skillPath}）` : "未安装"}`)
    .join("\n");

  const conclusion = status.ready
    ? "全部 skill 可用，建议按顺序调用后再执行 MCP 工具步骤。"
    : "部分 skill 缺失：继续执行 MCP 主流程，不阻塞；安装缺失 skill 后下次运行可获得更高质量输出。";

  return `## 🧩 Skill Bridge（UI/PRD 增强）

按顺序调用（宿主支持时）：
${orderLines}

当前状态：
${stateLines}

${conclusion}

---

`;
}
