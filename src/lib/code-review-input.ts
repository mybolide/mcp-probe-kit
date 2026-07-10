import * as fs from "node:fs";
import * as path from "node:path";
import { resolveWorkspaceRoot } from "./workspace-root.js";

export type GuidanceCodeInput = {
  code?: string;
  filePath?: string;
  projectRoot?: string;
};

export type GuidanceCodeResolved = {
  code: string;
  file?: string;
  error?: string;
};

/** 解析指南型工具的代码输入：优先 inline code，否则从 file_path 读取 */
export function resolveGuidanceCode(input: GuidanceCodeInput): GuidanceCodeResolved {
  return resolveReviewCode(input);
}

export function resolveReviewCode(input: GuidanceCodeInput): GuidanceCodeResolved {
  const inline = input.code?.trim() ?? "";
  if (inline) {
    return { code: inline, file: input.filePath?.trim() || undefined };
  }

  const filePath = input.filePath?.trim();
  if (!filePath) {
    return { code: "" };
  }

  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(input.projectRoot?.trim() || process.cwd(), filePath);

  if (!fs.existsSync(resolved)) {
    return { code: "", file: filePath, error: `文件不存在: ${resolved}` };
  }

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return { code: "", file: filePath, error: `不是文件: ${resolved}` };
    }
    return {
      code: fs.readFileSync(resolved, "utf-8"),
      file: filePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { code: "", file: filePath, error: `读取文件失败: ${message}` };
  }
}

export function trimCodeForPrompt(code: string, maxChars = 24000, inputKey = "reviewInput"): string {
  if (code.length <= maxChars) {
    return code;
  }
  const head = Math.floor(maxChars * 0.7);
  const tail = maxChars - head - 80;
  return `${code.slice(0, head)}\n\n/* ... [已截断，完整内容见 structuredContent.${inputKey}.code] ... */\n\n${code.slice(-tail)}`;
}

export function trimReviewCodeForPrompt(code: string, maxChars = 24000): string {
  return trimCodeForPrompt(code, maxChars, "reviewInput");
}
