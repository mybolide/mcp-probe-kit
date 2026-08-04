import { getNumber, getString, parseArgs } from '../utils/parseArgs.js';
import {
  buildProjectRootRetryHint,
  isLikelyProjectNamedRelativePath,
  resolveWorkspaceRoot,
} from '../lib/workspace-root.js';

export type RalphMode = 'safe' | 'normal';

export interface RalphConfig {
  goal: string;
  mode: RalphMode;
  completionPromise: string;
  testCommand: string;
  cliCommand: string;
  maxIterations: number;
  maxMinutes: number;
  confirmEvery: number;
  confirmTimeout: number;
  maxSameOutput: number;
  maxDiffLines: number;
  cooldownSeconds: number;
  projectRoot: string;
  isWindows: boolean;
}

export const RALPH_DEFAULTS = {
  mode: 'safe' as RalphMode,
  completionPromise: 'tests passing + requirements met',
  testCommand: 'npm test',
  cliCommand: 'claude-code',
  maxIterations: 8,
  maxMinutes: 25,
  confirmEvery: 1,
  confirmTimeout: 20,
  maxSameOutput: 2,
  maxDiffLines: 300,
  cooldownSeconds: 8,
};

export type RalphConfigResult =
  | { ok: true; value: RalphConfig }
  | { ok: false; response: Record<string, unknown> };

interface RawRalphArgs {
  goal?: string;
  mode?: string;
  completion_promise?: string;
  test_command?: string;
  cli_command?: string;
  max_iterations?: number;
  max_minutes?: number;
  confirm_every?: number;
  confirm_timeout?: number;
  max_same_output?: number;
  max_diff_lines?: number;
  cooldown_seconds?: number;
  project_root?: string;
}

function integerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  const parsed = getNumber(value, fallback);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} 必须是 ${min} 到 ${max} 之间的整数`);
  }
  return parsed;
}

function safeSingleLine(value: string, fallback: string, name: string): string {
  const normalized = (value || fallback).trim();
  if (!normalized) return fallback;
  if (/\r|\n|\0/.test(normalized)) {
    throw new Error(`${name} 必须是单行字符串`);
  }
  return normalized;
}

function invalidProjectRootResponse(value: string): Record<string, unknown> {
  return {
    content: [{
      type: 'text',
      text: `拒绝执行 Ralph 编排：project_root 不能传带项目名的半相对路径，例如 ${value}。请改为目标项目根目录绝对路径。`,
    }],
    isError: true,
    structuredContent: {
      error_code: 'INVALID_PROJECT_ROOT',
      rejected_project_root: value,
      retry_hint: buildProjectRootRetryHint(value),
    },
  };
}

export function normalizeRalphConfig(args: unknown): RalphConfigResult {
  try {
    const parsed = parseArgs<RawRalphArgs>(args, {
      defaultValues: {
        goal: 'Complete the development task',
        mode: RALPH_DEFAULTS.mode,
        completion_promise: RALPH_DEFAULTS.completionPromise,
        test_command: RALPH_DEFAULTS.testCommand,
        cli_command: RALPH_DEFAULTS.cliCommand,
        max_iterations: RALPH_DEFAULTS.maxIterations,
        max_minutes: RALPH_DEFAULTS.maxMinutes,
        confirm_every: RALPH_DEFAULTS.confirmEvery,
        confirm_timeout: RALPH_DEFAULTS.confirmTimeout,
        max_same_output: RALPH_DEFAULTS.maxSameOutput,
        max_diff_lines: RALPH_DEFAULTS.maxDiffLines,
        cooldown_seconds: RALPH_DEFAULTS.cooldownSeconds,
        project_root: '',
      },
      primaryField: 'goal',
      fieldAliases: {
        goal: ['目标', '任务', 'task'],
        mode: ['模式'],
        completion_promise: ['完成条件', '退出条件'],
        test_command: ['测试命令'],
        cli_command: ['命令', 'cli'],
        max_iterations: ['最大迭代', 'max_iters', 'max_rounds', '最大轮数'],
        max_minutes: ['最大时间', 'max_time'],
        confirm_every: ['确认频率'],
        confirm_timeout: ['确认超时'],
        max_same_output: ['最大重复'],
        max_diff_lines: ['最大变更行数'],
        cooldown_seconds: ['冷却时间'],
        project_root: ['projectRoot', 'project_path', 'projectPath', 'root', '项目路径', '项目根目录'],
      },
    });

    const rawProjectRoot = getString(parsed.project_root);
    if (isLikelyProjectNamedRelativePath(rawProjectRoot)) {
      return { ok: false, response: invalidProjectRootResponse(rawProjectRoot) };
    }
    const rawMode = (getString(parsed.mode) || RALPH_DEFAULTS.mode).toLowerCase();
    if (rawMode !== 'safe' && rawMode !== 'normal') {
      throw new Error(`mode 不支持: ${rawMode}。可选值: safe, normal`);
    }

    return {
      ok: true,
      value: {
        goal: getString(parsed.goal) || 'Complete the development task',
        mode: rawMode,
        completionPromise: safeSingleLine(getString(parsed.completion_promise), RALPH_DEFAULTS.completionPromise, 'completion_promise'),
        testCommand: safeSingleLine(getString(parsed.test_command), RALPH_DEFAULTS.testCommand, 'test_command'),
        cliCommand: safeSingleLine(getString(parsed.cli_command), RALPH_DEFAULTS.cliCommand, 'cli_command'),
        maxIterations: integerInRange(parsed.max_iterations, RALPH_DEFAULTS.maxIterations, 1, 20, 'max_iterations'),
        maxMinutes: integerInRange(parsed.max_minutes, RALPH_DEFAULTS.maxMinutes, 1, 240, 'max_minutes'),
        confirmEvery: integerInRange(parsed.confirm_every, RALPH_DEFAULTS.confirmEvery, 1, 20, 'confirm_every'),
        confirmTimeout: integerInRange(parsed.confirm_timeout, RALPH_DEFAULTS.confirmTimeout, 5, 600, 'confirm_timeout'),
        maxSameOutput: integerInRange(parsed.max_same_output, RALPH_DEFAULTS.maxSameOutput, 1, 10, 'max_same_output'),
        maxDiffLines: integerInRange(parsed.max_diff_lines, RALPH_DEFAULTS.maxDiffLines, 10, 5000, 'max_diff_lines'),
        cooldownSeconds: integerInRange(parsed.cooldown_seconds, RALPH_DEFAULTS.cooldownSeconds, 0, 300, 'cooldown_seconds'),
        projectRoot: resolveWorkspaceRoot(rawProjectRoot).replace(/\\/g, '/'),
        isWindows: process.platform === 'win32',
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      response: {
        content: [{ type: 'text', text: `Ralph 参数错误：${message}` }],
        isError: true,
        structuredContent: { error_code: 'INVALID_RALPH_CONFIG', message },
      },
    };
  }
}
