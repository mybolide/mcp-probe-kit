// mcp-probe-kit — git 封装（只读子命令 + 受控 worktree）
import { execFileSync } from "node:child_process";

const ENV = {
  ...process.env,
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
  GIT_LITERAL_PATHSPECS: "1",
  LC_ALL: "C",
};

export function git(root, args, { input } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: root,
      env: ENV,
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = (error.stderr ?? "").toString();
    const err = new Error(`git ${args.join(" ")} 失败: ${stderr.trim() || error.message}`);
    err.code = "E_GIT";
    err.stderr = stderr;
    err.status = error.status;
    throw err;
  }
}

export function isRepo(root) {
  try {
    return git(root, ["rev-parse", "--is-inside-work-tree"]).trim() === "true";
  } catch {
    return false;
  }
}

export function head(root) {
  return git(root, ["rev-parse", "HEAD"]).trim();
}

export function toplevel(root) {
  return git(root, ["rev-parse", "--show-toplevel"]).trim();
}

export function showFile(root, commit, file) {
  return git(root, ["show", `${commit}:${file}`]);
}

export function lsTree(root, commit, scope) {
  const out = git(root, ["ls-tree", "-r", "--name-only", commit, "--", ...scope]);
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

export function lsFiles(root) {
  const out = git(root, ["ls-files", "-co", "--exclude-standard"]);
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

export function isIgnored(root, rel) {
  try {
    git(root, ["check-ignore", "-q", "--", rel]);
    return true;
  } catch {
    return false;
  }
}

/** base..HEAD 的提交，含 trailer/patch-id 所需字段 */
export function logCommits(root, range) {
  const fmt = "%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%B%x1e";
  const out = git(root, ["log", "--format=" + fmt, range]);
  return out
    .split("\x1e")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [sha, an, ae, at, subject, body] = chunk.split("\x1f");
      return { sha, authorName: an, authorEmail: ae, authorTime: at, subject, body };
    });
}

export function trailers(body, key) {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "gim");
  const out = [];
  let m;
  while ((m = re.exec(body)) !== null) out.push(m[1].trim());
  return out;
}

/** 单提交的 numstat：合并提交用 -m --first-parent，避免 combined diff 为空 */
export function numstat(root, sha) {
  let out = "";
  try {
    out = git(root, ["diff", "-m", "--first-parent", "--numstat", `${sha}^..${sha}`]);
  } catch {
    out = git(root, ["show", "--numstat", "--format=", sha]); // 根提交
  }
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [add, del, file] = line.split("\t");
      return { file, added: Number(add) || 0, deleted: Number(del) || 0 };
    });
}

export function addedFiles(root, sha) {
  try {
    return git(root, ["diff", "-m", "--first-parent", "--name-only", "--diff-filter=A", `${sha}^..${sha}`])
      .split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return git(root, ["show", "--name-only", "--diff-filter=A", "--format=", sha])
      .split("\n").map((s) => s.trim()).filter(Boolean);
  }
}

export function patchId(root, sha) {
  try {
    const diff = git(root, ["diff", "-m", "--first-parent", `${sha}^..${sha}`]);
    const out = git(root, ["patch-id", "--stable"], { input: diff });
    return out.split(" ")[0]?.trim() || null;
  } catch {
    return null;
  }
}

/** 逐行保留 git 的两列状态前缀（不能 trim 左空白，否则首行会被切错） */
export function statusPorcelain(root, args = []) {
  return git(root, ["status", "--porcelain", ...args]).replace(/\s+$/, "");
}

export function isAncestor(root, sha, of = "HEAD") {
  try {
    git(root, ["merge-base", "--is-ancestor", sha, of]);
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

export function worktreeAdd(root, dir, commit = "HEAD") {
  git(root, ["worktree", "add", "--detach", "--force", dir, commit]);
}

export function worktreeRemove(root, dir) {
  try {
    git(root, ["worktree", "remove", "--force", dir]);
  } catch {
    /* 目录不存在时忽略 */
  }
}

/** 只提交指定文件（受控提交），并写入 trailer */
export function commitFiles(root, files, message, { author = "mcp-probe-kit@localhost" } = {}) {
  git(root, ["add", "--", ...files]);
  const args = ["-c", `user.email=${author}`, "-c", `user.name=mcp-probe-kit`, "commit", "-m", message, "--", ...files];
  git(root, args);
  return git(root, ["rev-parse", "HEAD"]).trim();
}

export function commitAll(root, message, { author = "mcp-probe-kit@localhost" } = {}) {
  git(root, ["add", "-A"]);
  const args = ["-c", `user.email=${author}`, "-c", `user.name=mcp-probe-kit`, "commit", "-m", message];
  git(root, args);
  return git(root, ["rev-parse", "HEAD"]).trim();
}