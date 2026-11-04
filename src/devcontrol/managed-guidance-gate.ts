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
import {
  CLI_CMD_REL_PATH, CLI_POWERSHELL_REL_PATH, CLI_SHELL_REL_PATH,
  CLI_RUNTIME_MANIFEST_REL_PATH, hasPinnedCliFallbackRuntime,
  previewCliFallbackManagedFiles, type CliRuntimeManifest,
} from "../lib/cli-fallback-installer.js";
import { VERSION } from "../version.js";

const managedPaths=new Set([MCP_PROBE_SKILL_REL_PATH,"AGENTS.md"]);
export function isManagedGuidancePath(path:string):boolean{return managedPaths.has(path);}

const managedCliPaths=new Set([
  CLI_CMD_REL_PATH,CLI_POWERSHELL_REL_PATH,CLI_SHELL_REL_PATH,
  CLI_RUNTIME_MANIFEST_REL_PATH,
]);
export function isManagedCliFallbackPath(file:string):boolean{
  return managedCliPaths.has(file);
}

/** A narrow no-lease exception for CLI bootstrap files. It compares staged
 * bytes with the actual current launcher generator and validates the pinned
 * runtime manifest. It never accepts arbitrary code, noncanonical JSON,
 * staged symlinks, or anything beyond these four installer-owned paths.
 */
export function checkManagedCliFallbackCommit(root:string,stagedFiles:readonly string[]):{
  passed:boolean;managedFiles:string[];issues:string[];
} {
  const files=[...new Set(stagedFiles)];
  const issues:string[]=[];
  for(const file of files)if(!managedCliPaths.has(file))
    issues.push(file+": not an MCP-managed CLI bootstrap file");
  const manifestStaged=files.includes(CLI_RUNTIME_MANIFEST_REL_PATH);
  const manifestGit=gitRead(root,["show",
    (manifestStaged?":":"HEAD:")+CLI_RUNTIME_MANIFEST_REL_PATH]);
  let manifest:CliRuntimeManifest|null=null;
  try {
    if(!manifestGit.ok)throw Error("missing version-pinned manifest");
    const raw=JSON.parse(manifestGit.text) as CliRuntimeManifest;
    const expectedKeys=["generatedByVersion","installedAt","localOnly","package",
      "packageSpec","schemaVersion","source","version","wrappers"];
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||
      JSON.stringify(Object.keys(raw).sort())!==JSON.stringify(expectedKeys.sort())||
      raw.schemaVersion!==1||raw.package!=="mcp-probe-kit"||
      raw.version!==VERSION||raw.packageSpec!==`mcp-probe-kit@${VERSION}`||
      raw.generatedByVersion!==VERSION||raw.source!=="mcp-bootstrap"||
      typeof raw.localOnly!=="boolean"||
      !raw.wrappers||typeof raw.wrappers!=="object"||
      Object.keys(raw.wrappers).length!==3||
      raw.wrappers.powershell!==CLI_POWERSHELL_REL_PATH||
      raw.wrappers.cmd!==CLI_CMD_REL_PATH||
      raw.wrappers.shell!==CLI_SHELL_REL_PATH||
      typeof raw.installedAt!=="string"||
      !Number.isFinite(Date.parse(raw.installedAt))||
      new Date(raw.installedAt).toISOString()!==raw.installedAt||
      Date.parse(raw.installedAt)>Date.now()+60_000)
      throw Error("invalid or noncanonical pinned runtime manifest");
    const previous=gitRead(root,["show","HEAD:"+CLI_RUNTIME_MANIFEST_REL_PATH]);
    let old:Partial<CliRuntimeManifest>|null=null;
    try{if(previous.ok)old=JSON.parse(previous.text) as Partial<CliRuntimeManifest>;}catch{}
    if(old?.version===VERSION&&old?.installedAt&&raw.installedAt!==old.installedAt)
      throw Error("installer timestamp changed without a package version change");
    const pinned=hasPinnedCliFallbackRuntime(root,VERSION);
    if(raw.localOnly!==Boolean(pinned||old?.localOnly===true))
      throw Error("local-only launcher policy differs from verified local runtime");
    manifest=raw;
  } catch(error) {
    issues.push("runtime.json: "+String(error instanceof Error?error.message:error));
  }
  if(manifest){
    const canonical=previewCliFallbackManagedFiles(root,manifest);
    for(const file of files){
      if(!managedCliPaths.has(file))continue;
      const mode=gitRead(root,["ls-files","--stage","--",file]);
      const requiredMode=file===CLI_SHELL_REL_PATH?"100755":"100644";
      const match=mode.ok?mode.text.match(
        new RegExp("^"+requiredMode+" ([0-9a-f]{40,64}) 0\\t")):null;
      if(!match){
        issues.push(file+": expected staged regular generator file with correct Git mode");
        continue;
      }
      // Hash canonical source through the same Git clean/eol filters used by
      // the index. Windows wrappers are CRLF in the generator but may be LF
      // Git blobs under an explicit `.gitattributes eol=crlf` policy.
      const expectedBlob=spawnSync("git",["hash-object","--path",file,"--stdin"],{
        cwd:root,windowsHide:true,encoding:"utf8",timeout:10_000,
        input:canonical[file],maxBuffer:2_000_000,
      });
      if(expectedBlob.status!==0||expectedBlob.error||
        expectedBlob.stdout.trim()!==match[1])
        issues.push(file+": staged bytes differ from current canonical MCP CLI generator");
    }
  }
  return {passed:issues.length===0,managedFiles:files.filter(isManagedCliFallbackPath),issues};
}

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
export function trustedCommittedGuidance(root:string,base:string,delivery:string,
  ignoredPaths:ReadonlySet<string>=new Set()):string[]{
  const commits=gitRead(root,['rev-list','--reverse',base+'..'+delivery]);
  if(!commits.ok)throw Error('Cannot inspect generator commit history');
  const trusted=new Set<string>();
  for(const commit of commits.text.trim().split('\n').filter(Boolean)){
    const parent=gitRead(root,['rev-parse',commit+'^']);
    if(!parent.ok)throw Error('Generator commit must have a traceable parent');
    const changed=gitRead(root,['diff','--name-only',parent.text.trim(),commit]);
    if(!changed.ok)throw Error('Cannot inspect generator changes');
    const managed=changed.text.trim().split('\n').filter(file=>
      isManagedGuidancePath(file)&&!ignoredPaths.has(file));
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
