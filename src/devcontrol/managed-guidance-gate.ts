/**
 * Narrow, deterministic exception for auto-generated tool guidance ONLY.
 * A path name or a comment claiming "generated" is NOT authorization.
 * Only staged bytes exactly reproduced from the installed tool's generators
 * and the previous committed AGENTS.md are exempt from a task lease.
 */
import { spawnSync } from "node:child_process";
import { previewManagedGuidanceSync } from "../lib/workflow-skill-installer.js";
import { MCP_PROBE_SKILL_REL_PATH } from "../lib/workflow-skill-template.js";

const managedPaths=new Set([MCP_PROBE_SKILL_REL_PATH,"AGENTS.md"]);

function gitRead(root:string,args:string[]):{ok:boolean;text:string} {
  const result=spawnSync("git",args,{
    cwd:root,encoding:"utf8",timeout:10_000,maxBuffer:2_000_000,
  });
  return {ok:result.status===0&&!result.error,text:result.stdout??""};
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
