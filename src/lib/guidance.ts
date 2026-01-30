export interface GuidanceHeaderOptions {
  tool: string;
  goal: string;
  tasks: string[];
  outputs?: string[];
  notes?: string[];
}

export function renderGuidanceHeader(options: GuidanceHeaderOptions): string {
  const lines: string[] = [];

  lines.push(`# 工具: ${options.tool}`);
  lines.push("");
  lines.push("## 🎯 目标");
  lines.push(options.goal);
  lines.push("");
  lines.push("## ✅ 你需要做的事");
  for (const task of options.tasks) {
    lines.push(`- ${task}`);
  }

  if (options.outputs && options.outputs.length > 0) {
    lines.push("");
    lines.push("## 📦 输出要求");
    for (const output of options.outputs) {
      lines.push(`- ${output}`);
    }
  }

  if (options.notes && options.notes.length > 0) {
    lines.push("");
    lines.push("## 🧭 注意事项");
    for (const note of options.notes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  return lines.join("\n");
}
