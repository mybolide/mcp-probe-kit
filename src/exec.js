// mcp-probe-kit — 断言执行（不持写事务；超时 600s）
import { spawn } from "node:child_process";
import crypto from "node:crypto";

export const TIMEOUT_MS = 600_000;
export const MAX_OUTPUT = 1024 * 1024;

export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function shellArgs(command) {
  return process.platform === "win32" ? ["cmd", ["/c", command]] : ["sh", ["-lc", command]];
}

export function execCommand(cwd, command, { timeout = TIMEOUT_MS, env = {} } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const [file, args] = shellArgs(command);
    const child = spawn(file, args, {
      cwd,
      env: { ...process.env, CI: "1", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const push = (chunk, to) => {
      const text = chunk.toString("utf8");
      if (to === "out") {
        if (stdout.length < MAX_OUTPUT) stdout += text;
        else truncated = true;
      } else {
        if (stderr.length < MAX_OUTPUT) stderr += text;
        else truncated = true;
      }
    };
    child.stdout.on("data", (c) => push(c, "out"));
    child.stderr.on("data", (c) => push(c, "err"));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        exit: 124,
        stdout,
        stderr: stderr + "\n[timeout]",
        durationMs: Date.now() - started,
        truncated,
        timedOut: true,
      });
    }, timeout);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exit: 127, stdout, stderr: String(error), durationMs: Date.now() - started, truncated });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exit: code ?? 1, stdout, stderr, durationMs: Date.now() - started, truncated });
    });
  });
}

/** 判定断言：`cmd :: exit==0` 或 `cmd :: stdout =~ /re/` */
export function evaluate(predicate, result) {
  const p = String(predicate ?? "").trim();
  if (/^exit\s*==\s*0$/.test(p)) return result.exit === 0;
  const re = p.match(/^stdout\s*=~\s*\/(.*)\/([a-z]*)$/s);
  if (re) {
    if (result.exit !== 0) return false;
    let regex;
    try {
      regex = new RegExp(re[1], re[2].includes("m") ? re[2] : `${re[2]}m`);
    } catch {
      return false;
    }
    return result.stdout.split("\n").some((line) => regex.test(line));
  }
  return false;
}