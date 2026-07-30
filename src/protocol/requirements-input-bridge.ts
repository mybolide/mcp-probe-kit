import {
  inputRequired,
  inputResponse,
  type Server,
} from "@modelcontextprotocol/server";
import type { InputResponses } from "@modelcontextprotocol/server";
import type { ToolResult } from "../server/runtime-types.js";

const REQUIREMENTS_INPUT_KEY = "requirements";
const LOOP_TOOLS = new Set(["start_feature", "start_bugfix", "start_ui"]);

export interface RequirementsInputApplication {
  args: unknown;
  cancelled?: string;
}

export function isRequirementsLoopRequest(toolName: string, args: unknown): boolean {
  if (!LOOP_TOOLS.has(toolName) || !isRecord(args)) return false;
  return String(args.requirements_mode ?? "steady").toLowerCase() === "loop";
}

export function supportsFormElicitation(
  server: Server,
  envelopeCapabilities: unknown
): boolean {
  const capabilities =
    (isRecord(envelopeCapabilities) ? envelopeCapabilities : undefined) ??
    server.getClientCapabilities();
  if (!isRecord(capabilities) || !isRecord(capabilities.elicitation)) return false;

  const elicitation = capabilities.elicitation;
  const keys = Object.keys(elicitation);
  if (keys.length === 0) return true;
  return isRecord(elicitation.form) || elicitation.form === true;
}

export function applyRequirementsInputResponses(
  toolName: string,
  args: unknown,
  inputResponses: Record<string, unknown> | undefined
): RequirementsInputApplication {
  if (!LOOP_TOOLS.has(toolName) || !inputResponses) return { args };

  const response = inputResponse(
    inputResponses as InputResponses,
    REQUIREMENTS_INPUT_KEY
  );
  if (response.kind === "missing") return { args };
  if (response.kind !== "elicit") return { args };
  if (response.action === "cancel" || response.action === "decline") {
    return {
      args,
      cancelled:
        response.action === "cancel"
          ? "用户取消了需求澄清"
          : "用户拒绝提供需求澄清信息",
    };
  }

  const content = isRecord(response.content) ? response.content : {};
  const answerLines = Object.entries(content).flatMap(([key, value]) =>
    isPrimitiveAnswer(value) ? [`- ${key}: ${formatAnswer(value)}`] : []
  );
  if (answerLines.length === 0) return { args };

  const source = isRecord(args) ? args : {};
  const primaryField =
    toolName === "start_bugfix" ? "error_message" : "description";
  const current = typeof source[primaryField] === "string" ? source[primaryField] : "";
  const supplemental = `用户补充的需求澄清：\n${answerLines.join("\n")}`;

  return {
    args: {
      ...source,
      [primaryField]: [current.trim(), supplemental].filter(Boolean).join("\n\n"),
      requirements_mode: "steady",
    },
  };
}

export function buildRequirementsInputRequired(
  result: ToolResult,
  enabled: boolean
): ReturnType<typeof inputRequired> | null {
  if (!enabled || !isRecord(result.structuredContent)) return null;

  const structured = result.structuredContent;
  if (structured.mode !== "loop") return null;
  if (isRecord(structured.stopConditions) && structured.stopConditions.ready === true) {
    return null;
  }
  if (!Array.isArray(structured.openQuestions) || structured.openQuestions.length === 0) {
    return null;
  }

  const properties: Record<
    string,
    {
      type: "string";
      title?: string;
      description?: string;
      minLength?: number;
    }
  > = {};
  const required: string[] = [];
  structured.openQuestions.slice(0, 12).forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const key = `answer_${index + 1}`;
    const question =
      typeof entry.question === "string" ? entry.question : `问题 ${index + 1}`;
    const context = typeof entry.context === "string" ? entry.context : undefined;
    properties[key] = {
      type: "string",
      title: question,
      ...(context ? { description: context } : {}),
      minLength: entry.required === false ? 0 : 1,
    };
    if (entry.required !== false) required.push(key);
  });

  if (Object.keys(properties).length === 0) return null;

  return inputRequired({
    inputRequests: {
      [REQUIREMENTS_INPUT_KEY]: inputRequired.elicit({
        message: "请一次性补充以下研发需求信息；回答将合并进完整任务范围后重新生成执行计划。",
        requestedSchema: {
          type: "object",
          properties,
          required,
          additionalProperties: false,
        },
      }),
    },
  });
}

function isPrimitiveAnswer(
  value: unknown
): value is string | number | boolean | string[] {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function formatAnswer(value: string | number | boolean | string[]): string {
  return Array.isArray(value) ? value.join("、") : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
