import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * One SQLite database per MCP workspace, with or without Git.
 * Existing Neyna installations keep their old file without copy/dual-writing.
 */
export function resolveProjectDatabase(root: string): string {
  const project = path.resolve(root);
  const legacy = path.join(project, ".neyna", "state", "devcontrol.sqlite3");
  if (fs.existsSync(legacy)) return legacy;
  return path.join(project, ".mcp-probe-kit", "state", "devcontrol.sqlite3");
}

/** Protect local state. Git exclude is an optional adapter, not a prerequisite
 * for a project to own a database. No-Git workspaces never invoke Git or
 * silently create a repository.
 */
export function ensureDatabaseIgnored(root: string, database: string): void {
  const project = path.resolve(root);
  const relative = path.relative(project, path.resolve(database)).split(path.sep).join("/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error("DevControl database must remain within its own project");
  }
  if (!fs.statSync(project).isDirectory()||fs.lstatSync(project).isSymbolicLink())
    throw new Error("DevControl workspace must be a real directory");
  // Do not let a local state path resolve through a symlink, into a child
  // repository, or into another user's directory. Existing project files
  // remain untouched; new folders are private to the local account.
  const parts=relative.split("/");
  let cursor=project;
  for(let i=0;i<parts.length-1;i++){
    cursor=path.join(cursor,parts[i]);
    if(fs.existsSync(cursor)){
      const stat=fs.lstatSync(cursor);
      if(stat.isSymbolicLink()||!stat.isDirectory())
        throw new Error("Unsafe DevControl local state directory");
    }else{
      fs.mkdirSync(cursor,{mode:0o700});
    }
  }
  if(fs.existsSync(database)&&fs.lstatSync(database).isSymbolicLink())
    throw new Error("Unsafe DevControl SQLite symlink");
  if(!fs.existsSync(path.join(project,".git"))){
    // Nothing to exclude without Git. The private state folder belongs to
    // this workspace and must not depend on a parent Git checkout.
    return;
  }
  try {
    // Git may exceed two seconds while other agents are committing or
    // auditing a large repository. Still fail closed on a bounded deadline.
    const gitPath = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], {
      windowsHide: true, cwd: project, encoding: "utf8", timeout: 8_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!gitPath) throw new Error("Git returned an empty info/exclude path");
    const exclude = path.isAbsolute(gitPath) ? gitPath : path.resolve(project, gitPath);
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    // Exclude the complete local state directory, including SQLite WAL/SHM
    // and any future generated reports, even in projects with no .gitignore.
    const rule = "/" + relative.slice(0, relative.lastIndexOf("/") + 1);
    const existing = fs.existsSync(exclude) ? fs.readFileSync(exclude, "utf8") : "";
    if (!existing.split(/\r?\n/).includes(rule)) {
      fs.appendFileSync(exclude, (existing && !existing.endsWith("\n") ? "\n" : "") +
        "# DevControl project-local state (never tracked)\n" + rule + "\n");
    }
    // Concurrent project initializers may append to this file. Always
    // validate the actual on-disk rule before considering the database safe.
    if (!fs.readFileSync(exclude, "utf8").split(/\r?\n/).includes(rule)) {
      throw new Error("Git info/exclude does not contain the state directory");
    }
  } catch (cause) {
    // Never silently bypass exclusion or swallow the underlying diagnosis.
    // Preserve the original error for local troubleshooting.
    throw new Error("Cannot configure project-local Git exclude for DevControl SQLite", {
      cause,
    });
  }
}
