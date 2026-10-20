/**
 * Project onboarding is a read-only reconciliation of actual Git sources and
 * the project's existing task ledger. It never invents a plan, writes new
 * Markdown, changes task status, or replaces an approved document.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export interface OnboardingStep {
  id: "purpose" | "governance" | "requirements" | "architecture" | "plan";
  label: string;
  status: "present" | "missing";
  source: string | null;
  suggestedPath: string | null;
  instruction: string;
}

export interface ProjectOnboarding {
  kind: "new" | "existing";
  readiness: "needs_baseline" | "needs_plan" | "ready_for_review";
  taskCount: number;
  approvedTaskCount: number;
  steps: OnboardingStep[];
  nextAction: string;
  /** Always describes an inspection, never authorizes creation or execution. */
  readOnly: true;
}

interface ExistingTask {
  [field: string]: unknown;
}

const SOURCES = [
  {
    id: "purpose", label: "目标与项目背景",
    paths: ["docs/product/vision.md", "docs/project-context.md"],
    suggested: "docs/product/vision.md",
    instruction: "核对项目目标与非目标；缺失时由 Agent 起草并交项目所有者确认",
  },
  {
    id: "governance", label: "规范与变更边界",
    paths: ["docs/CONSTITUTION.md", "docs/constitution.md"],
    suggested: "docs/CONSTITUTION.md",
    instruction: "确认质量门禁、权限、架构变更和文档归属，不覆盖既有规范",
  },
  {
    id: "requirements", label: "需求与验收依据",
    paths: ["docs/product/requirements.md", "docs/requirements.md"],
    suggested: "docs/product/requirements.md",
    instruction: "按已有需求核对范围与验收条件；缺失时不得自动生成研发任务",
  },
  {
    id: "architecture", label: "技术架构基线",
    paths: ["docs/architecture/overview.md", "docs/architecture.md", "docs/project-context/architecture.md"],
    suggested: "docs/architecture/overview.md",
    instruction: "梳理真实模块、契约、技术约束及需审批的架构决策",
  },
] as const;

function validSource(root: string, relative: string): boolean {
  try {
    const project = fs.realpathSync(root);
    const absolute = path.resolve(root, relative);
    const real = fs.realpathSync(absolute);
    const inside = path.relative(project, real);
    if (!inside || inside.startsWith(".." + path.sep) || inside === ".." ||
        path.isAbsolute(inside)) return false;
    const stats = fs.statSync(real);
    return stats.isFile() && stats.size > 0 && stats.size <= 262_144 &&
      fs.readFileSync(real, "utf8").trim().length > 10;
  } catch {
    return false;
  }
}

function hasExistingWork(root: string): boolean {
  try {
    const tracked = execFileSync("git", ["ls-files", "-z"], {
      cwd: root, timeout: 2_000, maxBuffer: 1_000_000,
    }).toString("utf8").split("\0");
    return tracked.some(file => /^(?:src|app|apps|lib|services|tests|packages|cmd)\//.test(file));
  } catch {
    // When Git inspection is unavailable, do not infer existing work.
    return false;
  }
}

export function projectOnboarding(root: string, tasks: ExistingTask[]): ProjectOnboarding {
  const project = path.resolve(root);
  const approvedTaskCount = tasks.filter(t => t.status !== "draft" &&
    t.status !== "cancelled" && typeof t.approvedBy === "string" &&
    t.approvedBy.trim().length > 0).length;
  const steps: OnboardingStep[] = SOURCES.map(item => {
    const source = item.paths.find(file => validSource(project, file)) ?? null;
    return {
      id: item.id, label: item.label,
      status: source ? "present" : "missing",
      source, suggestedPath: source ? null : item.suggested,
      instruction: item.instruction,
    };
  });
  const planSource = [
    "docs/roadmap/zero-to-one-plan.md",
    "docs/roadmap/implementation-plan.md",
  ].find(file => validSource(project, file)) ?? null;
  const approvedPlanExists = approvedTaskCount > 0 && planSource !== null;
  steps.push({
    id: "plan", label: "已批准的研发计划与任务",
    status: approvedPlanExists ? "present" : "missing",
    source: approvedPlanExists ? planSource + " + project SQLite dc_tasks" : null,
    suggestedPath: planSource ? null : "docs/roadmap/zero-to-one-plan.md",
    instruction: "先依据确认的需求和架构形成固定的依赖计划并由 Owner 审批；仅有零散获批任务不代表完整研发计划",
  });
  const absent = steps.filter(s => s.status === "missing");
  const kind = tasks.length || steps.slice(0, 4).some(s => s.status === "present") ||
    hasExistingWork(project) ? "existing" : "new";
  const readiness = absent.some(s => s.id !== "plan") ? "needs_baseline" :
    !approvedPlanExists ? "needs_plan" : "ready_for_review";
  return {
    kind, readiness, taskCount: tasks.length, approvedTaskCount,
    steps, readOnly: true,
    nextAction: absent[0]?.instruction ??
      "从 SQLite 恢复获批任务与 History Session；依赖未满足时不得跳过",
  };
}
