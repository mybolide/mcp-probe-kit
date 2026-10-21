/**
 * Optional local commit guard. Never overwrite another project's hooks.
 * It is a convenience guard, not a security boundary (--no-verify / -c
 * core.hooksPath bypass it). Real enforcement requires protected CI.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DevControlError } from "./task-ledger.js";

function git(root:string,args:string[]):string {
  const result=spawnSync("git",args,{cwd:root,encoding:"utf8",timeout:6_000});
  if(result.status!==0||result.error)throw new DevControlError(
    "GIT_ERROR",result.stderr?.trim()||"Git inspection failed");
  return result.stdout.trim();
}

export interface HookStatus {
  state:"available"|"existing"|"managed"|"custom-path";
  hookPath:string;
  installed:boolean;
  details:string;
}

const signature="# Managed by mcp-probe-kit DevControl commit gate v1";
export function hookStatus(root:string):HookStatus {
  const config=spawnSync("git",["config","--get","core.hooksPath"],
    {cwd:root,encoding:"utf8",timeout:6_000});
  if(config.status===0&&config.stdout.trim()){
    const custom=config.stdout.trim();
    const file=path.join(path.isAbsolute(custom)?custom:path.resolve(root,custom),"pre-commit");
    const checks=fs.existsSync(file)&&fs.statSync(file).isFile() &&
      fs.readFileSync(file,"utf8").includes("devcontrol check");
    return {state:"custom-path",hookPath:custom,installed:false,
      details:checks?"Existing project-owned pre-commit already invokes devcontrol check; preserved":
        "Existing core.hooksPath is owned by the project; integrate without replacing it"};
  }
  const dir=path.resolve(root,git(root,["rev-parse","--git-path","hooks"]));
  const hookPath=path.join(dir,"pre-commit");
  if(!fs.existsSync(hookPath))
    return {state:"available",hookPath,installed:false,details:"No existing pre-commit hook"};
  const text=fs.readFileSync(hookPath,"utf8").slice(0,4096);
  const managed=text.includes(signature);
  return {state:managed?"managed":"existing",hookPath,installed:managed,
    details:managed?"DevControl pre-commit hook present":
      "Existing pre-commit hook preserved; manually chain DevControl check"};
}

export function installHook(root:string,entry:string):HookStatus {
  const existing=hookStatus(root);
  if(existing.state==="managed")return existing;
  if(existing.state!=="available")throw new DevControlError(
    "HOOK_CONFLICT","Existing Git hook or hooksPath must be preserved and manually integrated");
  if(!path.isAbsolute(entry)||!fs.statSync(entry).isFile())throw new DevControlError(
    "INVALID_ENTRY","Use an absolute path to an installed DevControl CLI entry");
  // POSIX shell quoting is safe for paths with whitespace, apostrophes and $.
  const quote=(value:string)=>"'"+value.replace(/'/g,"'\\''")+"'";
  const script="#!/bin/sh\n"+signature+"\nset -eu\n"+
    "ROOT=\"$(git rev-parse --show-toplevel)\"\n"+
    "exec node "+quote(entry)+" devcontrol check --project-root \"$ROOT\"\n";
  fs.mkdirSync(path.dirname(existing.hookPath),{recursive:true});
  // Exclusive create prevents overwriting a hook installed by another process.
  const fd=fs.openSync(existing.hookPath,"wx",0o755);
  try{fs.writeFileSync(fd,script,"utf8");}
  finally{fs.closeSync(fd);}
  fs.chmodSync(existing.hookPath,0o755);
  return hookStatus(root);
}
