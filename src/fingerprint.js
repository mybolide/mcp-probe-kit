// mcp-probe-kit — scope 指纹（claim 记录一次；close 比对 R2 起止两次）
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isIgnored, lsFiles, lsTree } from "./git.js";

export const MAX_SCOPE_FILES = 2000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function toPosix(p) {
  return p.split(path.sep).join("/");
}

export function normalize(p) {
  return toPosix(p).normalize("NFC");
}

/** 按路径段比较：prefix 覆盖 prefix/**，不覆盖 prefix-x/** */
export function inScope(file, scope) {
  const f = normalize(file);
  return scope.some((raw) => {
    const s = normalize(raw).replace(/\/+$/, "");
    return f === s || f.startsWith(s + "/");
  });
}

function walk(root, dir = "", out = []) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === ".mcp-probe-kit") continue;
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(root, rel, out);
    else out.push(rel);
  }
  return out;
}

export function scopeFiles(root, scope) {
  let tracked = [];
  try {
    tracked = lsFiles(root);
  } catch {
    tracked = []; // 弱模式（无 git）
  }
  const cand = new Set([...walk(root), ...tracked]);
  const out = [];
  for (const rel of cand) {
    const p = toPosix(rel);
    if (!inScope(p, scope)) continue;
    if (isIgnored(root, p)) continue;
    out.push(p);
  }
  return out.sort();
}

/**
 * fingerprint = sha256(anchor + "\0" + 每个 scope 文件的 path/exec/内容哈希 + 删除项)
 * anchor 为当前 HEAD（claim 时记录、close 时同一 HEAD）。
 */
export function fingerprint(root, scope, anchor) {
  const files = scopeFiles(root, scope);
  if (files.length > MAX_SCOPE_FILES) {
    const err = new Error(`E_SCOPE_TOO_BROAD: scope 内 ${files.length} 个文件 > ${MAX_SCOPE_FILES}`);
    err.code = "E_SCOPE_TOO_BROAD";
    throw err;
  }
  const parts = [];
  for (const p of files) {
    const abs = path.join(root, p);
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch {
      parts.push(`${p}:missing`);
      continue;
    }
    if (st.size > MAX_FILE_BYTES) {
      const err = new Error(`E_FILE_TOO_LARGE: ${p} ${st.size} bytes`);
      err.code = "E_FILE_TOO_LARGE";
      throw err;
    }
    if (st.isSymbolicLink()) {
      parts.push(`${p}:link:${fs.readlinkSync(abs)}`);
      continue;
    }
    const buf = fs.readFileSync(abs);
    const body = buf.includes(0) ? buf : Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
    parts.push(`${p}:${(st.mode & 0o111) ? "x" : "-"}:${sha256(body)}`);
  }
  let treeFiles = [];
  if (anchor) {
    try {
      treeFiles = lsTree(root, anchor, scope);
    } catch {
      treeFiles = [];
    }
  }
  const tracked = new Set(treeFiles);
  for (const p of tracked) {
    if (!fs.existsSync(path.join(root, p))) parts.push(`${p}:deleted`);
  }
  return sha256(Buffer.from(`${anchor}\0${parts.join("\n")}`));
}