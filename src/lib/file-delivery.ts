import * as fs from "node:fs";
import * as path from "node:path";

export type FileWriteAction = "created" | "updated" | "skipped";

export interface DeliveredFile {
  path: string;
  action: FileWriteAction;
}

export interface PendingFile {
  path: string;
  reason: string;
}

export interface FileDeliveryReport {
  writtenFiles: DeliveredFile[];
  pendingFiles: PendingFile[];
}

export interface FileStatusEntry {
  path: string;
  exists: boolean;
  written: boolean;
  agent_action_required: boolean;
  purpose?: string;
}

export function toPosixRel(relPath: string): string {
  return relPath.replace(/\\/g, "/");
}

export function writeProjectFile(
  projectRoot: string,
  relPath: string,
  content: string,
  policy: "ifMissing" | "always"
): DeliveredFile {
  const posixPath = toPosixRel(relPath);
  const absPath = path.join(path.resolve(projectRoot), ...posixPath.split("/"));
  const existed = fs.existsSync(absPath);
  if (policy === "ifMissing" && existed) {
    return { path: posixPath, action: "skipped" };
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf8");
  return { path: posixPath, action: existed ? "updated" : "created" };
}

export function buildFileStatusEntries(
  projectRoot: string,
  entries: Array<{ path: string; purpose?: string }>,
  writtenFiles: DeliveredFile[],
  pendingFiles: PendingFile[]
): FileStatusEntry[] {
  const writtenByMcp = new Set(
    writtenFiles
      .filter((file) => file.action === "created" || file.action === "updated")
      .map((file) => toPosixRel(file.path))
  );
  const pendingPaths = new Set(pendingFiles.map((file) => toPosixRel(file.path)));

  return entries.map(({ path: relPath, purpose }) => {
    const posixPath = toPosixRel(relPath);
    const absPath = path.join(path.resolve(projectRoot), ...posixPath.split("/"));
    const exists = fs.existsSync(absPath);
    const agent_action_required = pendingPaths.has(posixPath);
    const written = writtenByMcp.has(posixPath) || (exists && !agent_action_required);
    return {
      path: posixPath,
      ...(purpose !== undefined ? { purpose } : {}),
      exists,
      written,
      agent_action_required,
    };
  });
}

export function mergeDeliveryReports(...reports: FileDeliveryReport[]): FileDeliveryReport {
  return {
    writtenFiles: reports.flatMap((report) => report.writtenFiles),
    pendingFiles: reports.flatMap((report) => report.pendingFiles),
  };
}

export function formatFileDeliverySection(report: FileDeliveryReport): string {
  const lines = ["## 文件落盘状态"];
  if (report.writtenFiles.length > 0) {
    lines.push("", "### 已写入（MCP 服务端）");
    for (const file of report.writtenFiles) {
      const verb =
        file.action === "created" ? "已创建" : file.action === "updated" ? "已更新" : "已跳过（已存在）";
      lines.push(`- \`${file.path}\` — ${verb}`);
    }
  }
  if (report.pendingFiles.length > 0) {
    lines.push("", "### 尚未创建（仅规划 / 待后续步骤）");
    for (const file of report.pendingFiles) {
      lines.push(`- \`${file.path}\` — ${file.reason}`);
    }
  }
  if (report.writtenFiles.length === 0 && report.pendingFiles.length === 0) {
    lines.push("", "- 无文件变更");
  }
  return lines.join("\n");
}
