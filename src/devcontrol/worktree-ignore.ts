/** DevControl's project-root worktree exemption, independent of Git ignore.
 *
 * Explicit patterns apply to tracked and untracked ordinary working files.
 * Git's index, committed task evidence and frozen scopes remain unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export const LOCAL_WORKTREE_IGNORE_NAME='.devcontrol-worktree-ignore';
const DEFAULT_RULES=`# MCP Probe Kit local worktree exclusions (Git tracking is unchanged).
# Uncomment only the local tool files you intentionally want to exclude.
# /AGENTS.md
# /.agents/skills/mcp-probe-kit/SKILL.md
# /.cursor/mcp.json
# /docs/history-session/
`;

function names(root:string,args:string[]):string[]{
  const r=spawnSync('git',args,{cwd:root,encoding:'buffer',timeout:12000,windowsHide:true});
  if(r.status!==0||!Buffer.isBuffer(r.stdout))
    throw Error('Cannot read Git worktree ignore candidates');
  return r.stdout.toString('utf8').split('\0').filter(Boolean).sort();
}

/** Explicit rules are not permission to hide arbitrary application code.
 * Allow a narrow local History/archive or scratch-notes folder even if it
 * lives under docs/. Approved PRD/ADR/design/scope sources elsewhere in docs
 * remain protected. A frozen task path is forbidden regardless of filename.
 */
function nonBusinessLocalFile(file:string):boolean{
  if(file==='AGENTS.md'||file==='.agents/skills/mcp-probe-kit/SKILL.md'||
      file==='.cursor/mcp.json'||file==='.cursor/settings.json'||
      file==='.vscode/settings.json'||file==='.vscode/launch.json'||
      file==='.claude/settings.json'||file==='.claude/settings.local.json'||
      file==='.codex/config.toml')return true;
  if(/^\.cursor\/rules\/[a-zA-Z0-9_.-]+\.mdc?$/.test(file))return true;
  // These are local legacy History exports and scratch notes, not an
  // exemption for docs/**. Existing reviewed source documents still have
  // independent Git/content-SHA checks at planning/acceptance boundaries.
  if(/^docs\/history-session\/(?:[1-9][0-9]*\.md|index\.json|\.history\.lock|memory\/[a-zA-Z0-9_./-]+\.(?:md|json))$/.test(file))
    return true;
  if(/^docs\/local-notes\/[a-zA-Z0-9_./-]+\.(?:md|txt|log)$/.test(file))
    return true;
  // Temporary outputs are only local noise outside business source trees.
  if(/^(src|app|apps|lib|client|server|packages|services|tests|test|docs|api|cmd|scripts|infra|db|migrations|assets)\//.test(file))
    return false;
  return /(?:^|\/)[a-zA-Z0-9_.-]+\.(?:tmp|log)$/.test(file);
}

export function localWorktreeIgnoreFile(root:string):string{
  return path.join(path.resolve(root),LOCAL_WORKTREE_IGNORE_NAME);
}

/** Created only during explicit project setup. Never touch .git,
 * .gitignore or an existing Owner-edited configuration. The template has no
 * active exclusions until the user explicitly enables a safe local pattern.
 */
export function ensureLocalWorktreeIgnoreFile(root:string):string|null{
  const repo=spawnSync('git',['rev-parse','--show-toplevel'],{
    cwd:root,encoding:'utf8',timeout:12000,windowsHide:true});
  if(repo.status!==0||!repo.stdout?.trim()||
      fs.realpathSync(repo.stdout.trim())!==fs.realpathSync(root))return null;
  const source=localWorktreeIgnoreFile(root);
  if(!fs.existsSync(source)){
    try{fs.writeFileSync(source,DEFAULT_RULES,{encoding:'utf8',flag:'wx',mode:0o600});}
    catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  }
  localPatternFile(root); // Reject symlinks, non-files and oversized configs.
  return source;
}

function localPatternFile(root:string):string|null{
  const source=localWorktreeIgnoreFile(root);
  let file:fs.Stats;
  try{file=fs.lstatSync(source);}
  catch(error){
    if((error as NodeJS.ErrnoException).code==='ENOENT')return null;
    throw error;
  }
  const parent=fs.lstatSync(path.dirname(source));
  if(!parent.isDirectory()||parent.isSymbolicLink()||!file.isFile()||
      file.isSymbolicLink()||file.size>65536)
    throw Error('Unsafe local worktree-ignore configuration');
  return source;
}

/** Match exact local patterns against tracked OR untracked paths. In
 * particular --cached --ignored uses Git's pattern parser without assuming
 * that tracked files obey .gitignore. This never modifies Git's index.
 */
export function localWorktreeExemptedFiles(root:string,candidates:string[],
  inScope:(file:string)=>boolean=()=>false):string[]{
  const source=localPatternFile(root);
  if(!source||!candidates.length)return [];
  const matched=new Set(names(root,['ls-files','--cached','--others','--ignored',
    '--exclude-from='+source,'-z']));
  const lexicalRoot=path.resolve(root),realRoot=fs.realpathSync(root);
  const selected=[...new Set(candidates)].filter(file=>matched.has(file)).sort();
  for(const fileName of selected){
    if(inScope(fileName))
      throw Error('worktree-ignore cannot exempt a frozen task file: '+fileName);
    if(!fileName||path.isAbsolute(fileName)||fileName.split('/').includes('..'))
      throw Error('worktree-ignore path outside repository: '+fileName);
    const full=path.resolve(root,fileName);
    if(!full.startsWith(lexicalRoot+path.sep))
      throw Error('worktree-ignore path outside repository: '+fileName);
    for(let folder=path.dirname(full);folder!==lexicalRoot;folder=path.dirname(folder)){
      if(!folder.startsWith(lexicalRoot+path.sep)||fs.lstatSync(folder).isSymbolicLink())
        throw Error('worktree-ignore cannot exempt symlink ancestry: '+fileName);
    }
    const stat=fs.lstatSync(full);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024||
        !fs.realpathSync(full).startsWith(realRoot+path.sep))
      throw Error('worktree-ignore cannot exempt non-regular or linked files: '+fileName);
    if(!nonBusinessLocalFile(fileName))
      throw Error('worktree-ignore cannot exempt business source or unsupported local file: '+fileName);
  }
  return selected;
}

/** Git's global/project ignores still govern the initial untracked set.
 * The explicit DevControl rules additionally apply to already tracked WIP.
 */
export function auditedUntrackedFiles(root:string,
  inScope:(file:string)=>boolean=()=>false):string[]{
  const candidates=names(root,['ls-files','--others','--exclude-standard','-z']);
  const exempt=new Set(localWorktreeExemptedFiles(root,candidates,inScope));
  // The optional local config is never part of a task's source delivery.
  // Check its type before excluding it, and never exempt a frozen file.
  if(candidates.includes(LOCAL_WORKTREE_IGNORE_NAME)&&
      !inScope(LOCAL_WORKTREE_IGNORE_NAME)&&localPatternFile(root))
    exempt.add(LOCAL_WORKTREE_IGNORE_NAME);
  return candidates.filter(file=>!exempt.has(file));
}

/** Do not mistake the freshly created, untracked MCP configuration itself
 * for Owner source changes. Any staged, tracked-modified, linked or malformed
 * config remains visible and subject to the normal repository checks.
 */
export function gitStatusWithoutLocalConfig(root:string):string[]{
  const r=spawnSync('git',['status','--porcelain=v1','--untracked-files=all','-z'],{
    cwd:root,encoding:'buffer',timeout:12000,windowsHide:true});
  if(r.status!==0||!Buffer.isBuffer(r.stdout))
    throw Error('Cannot read Git status for DevControl worktree');
  const entries=r.stdout.toString('utf8').split('\0').filter(Boolean);
  const source=localPatternFile(root);
  return entries.filter(entry=>!(entry==='?? '+LOCAL_WORKTREE_IGNORE_NAME&&source));
}
