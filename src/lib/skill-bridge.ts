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
    name: "interaction-design",
    role: "补充交互状态、流程与可访问性约束，不改变已锁定的视觉方向",
    appliesTo: ["start_ui", "start_product"],
  },
  {
    name: "frontend-design",
    role: "补充前端实现细节与组件质量，不重新选择风格、配色或字体",
    appliesTo: ["start_ui", "start_product"],
  },
  {
    name: "ui-ux-pro-max",
    role: "仅提供页面结构与模式参考；风格标签和主题推荐不得覆盖视觉方向契约",
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
  const authorityBoundary = status.workflow === "start_ui"
    ? "视觉方向契约已经锁定；Skill 只能补充交互、实现和结构参考，禁止重新选择视觉风格、配色、字体、密度或禁用项"
    : "当前产品约束与交付目标已经锁定；Skill 只能补充细节，不得覆盖用户目标和核心约束";

  return {
    id: "skill-bridge",
    type: "agent_action" as const,
    action: "invoke_installed_skills",
    when: "主契约生成后，宿主支持 skill 调用且对应 skill 已安装时执行",
    requiredInputs: [
      authorityBoundary,
      `按顺序检查可用 skill：${status.skills.map((item) => item.name).join(", ")}`,
    ],
    expectedOutputs: [
      "只合并不冲突的交互状态、实现细节和页面结构建议",
      "任何与主契约冲突的风格标签或主题推荐均已丢弃",
    ],
    note:
      status.missingCount === 0
        ? "全部增强 skill 可用；主契约优先级最高"
        : `缺失 ${status.skills.filter((item) => !item.installed).map((item) => item.name).join(", ")}；继续执行 MCP 主流程，不得把缺失 skill 当成阻塞`,
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
    ? "全部 skill 可用，但视觉方向契约与产品约束始终拥有最高优先级。"
    : "部分 skill 缺失：继续执行 MCP 主流程，不阻塞；不得降低视觉方向和验收标准。";

  return `## Skill Bridge（受控增强）

调用边界：先锁定主契约，再按顺序调用可用 Skill。Skill 只补充交互、实现与结构参考，禁止覆盖视觉方向、密度、配色、字体、禁用项和验收分数。

${orderLines}

当前状态：
${stateLines}

${conclusion}

---

`;
}
