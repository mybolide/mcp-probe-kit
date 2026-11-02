/**
 * Narrow, deterministic exception for auto-generated tool guidance ONLY.
 * A path name or a comment claiming "generated" is NOT authorization.
 * Only staged bytes exactly reproduced from the installed tool's generators
 * and the previous committed AGENTS.md are exempt from a task lease.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { previewManagedGuidanceSync } from "../lib/workflow-skill-installer.js";
import { MCP_PROBE_SKILL_REL_PATH } from "../lib/workflow-skill-template.js";

const managedPaths=new Set([MCP_PROBE_SKILL_REL_PATH,"AGENTS.md"]);
export function isManagedGuidancePath(path:string):boolean{return managedPaths.has(path);}

function gitRead(root:string,args:string[]):{ok:boolean;text:string} {
  const result=spawnSync("git",args,{
    windowsHide: true, cwd:root,encoding:"utf8",timeout:10_000,maxBuffer:2_000_000,
  });
  return {ok:result.status===0&&!result.error,text:result.stdout??""};
}

/** Working-tree counterpart of the committed guidance gate.
 * A bootstrapped Skill / AGENTS.md is maintenance performed by MCP, not
 * developer source. Exempt ONLY exact current generator bytes derived from
 * the committed user-owned AGENTS.md content. Never derive the expected
 * user-owned text from the already modified worktree, which would silently
 * approve arbitrary changes to custom instructions.
 *
 * This is a read-only check. Staged changes are still rejected by the
 * original worktree/index checker before this function is reached.
 */
export function trustedUncommittedGuidance(root:string,files:readonly string[]):string[] {
  const candidates=files.filter(isManagedGuidancePath);
  if(!candidates.length)return [];
  const committed=gitRead(root,["show","HEAD:AGENTS.md"]);
  let generated:{skill:string;agents:string};
  try{generated=previewManagedGuidanceSync(root,committed.ok?committed.text:null);}
  catch{return [];}
  return candidates.filter(file=>{
    try {
      const location=path.resolve(root,file);
      const stat=fs.lstatSync(location);
      if(!stat.isFile()||stat.isSymbolicLink())return false;
      const expected=file==="AGENTS.md"?generated.agents:generated.skill;
      return fs.readFileSync(location,"utf8")===expected;
    }catch{return false;}
  });
}

/** Only canonical generator output is exempt from a task's committed file
 * scope. Validate each intermediate commit against its own first parent,
 * never bless a path merely because it is named AGENTS.md or SKILL.md.
 */
export function trustedCommittedGuidance(root:string,base:string,delivery:string):string[]{
  const commits=gitRead(root,['rev-list','--reverse',base+'..'+delivery]);
  if(!commits.ok)throw Error('Cannot inspect generator commit history');
  const trusted=new Set<string>();
  for(const commit of commits.text.trim().split('\n').filter(Boolean)){
    const parent=gitRead(root,['rev-parse',commit+'^']);
    if(!parent.ok)throw Error('Generator commit must have a traceable parent');
    const changed=gitRead(root,['diff','--name-only',parent.text.trim(),commit]);
    if(!changed.ok)throw Error('Cannot inspect generator changes');
    const managed=changed.text.trim().split('\n').filter(isManagedGuidancePath);
    if(!managed.length)continue;
    const old=gitRead(root,['show',parent.text.trim()+':AGENTS.md']);
    const generated=previewManagedGuidanceSync(root,old.ok?old.text:null);
    for(const file of managed){
      const candidate=gitRead(root,['show',commit+':'+file]);
      const expected=file==='AGENTS.md'?generated.agents:generated.skill;
      if(!candidate.ok||candidate.text!==expected)
        throw Error('Committed managed guidance does not match its canonical generator: '+file);
      trusted.add(file);
    }
  }
  return [...trusted];
}

export function checkManagedGuidanceCommit(root:string,stagedFiles:readonly string[]):{
  passed:boolean;managedFiles:string[];issues:string[];
} {
  const unique=[...new Set(stagedFiles)];
  const managedFiles=unique.filter(file=>managedPaths.has(file));
  if(!managedFiles.length)return {passed:false,managedFiles:[],issues:[]};

  const issues:string[]=[];
  const headAgents=gitRead(root,["show","HEAD:AGENTS.md"]);
  const canonical=previewManagedGuidanceSync(root,headAgents.ok?headAgents.text:null);
  for(const file of managedFiles){
    const mode=gitRead(root,["ls-files","--stage","--",file]);
    if(!mode.ok||!/^100644 [0-9a-f]{40,64} 0\t/.test(mode.text)){
      issues.push(file+": expected a regular staged generated file (not a symlink)");
      continue;
    }
    const staged=gitRead(root,["show",":"+file]);
    const expected=file==="AGENTS.md"?canonical.agents:canonical.skill;
    if(!staged.ok||staged.text!==expected)
      issues.push(file+": staged content differs from the tool-generated guidance; custom changes require an approved task");
  }
  for(const file of unique)if(!managedPaths.has(file))
    issues.push(file+": not a managed guidance file; approved task lease required");
  return {passed:issues.length===0,managedFiles,issues};
}
