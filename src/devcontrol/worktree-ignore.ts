/** DevControl's machine-local worktree exemption, independent of Git ignore.
 *
 * Explicit patterns apply to tracked and untracked ordinary working files.
 * Git's index, committed task evidence and frozen scopes remain unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

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
  const r=spawnSync('git',['rev-parse','--absolute-git-dir'],{
    cwd:root,encoding:'utf8',timeout:12000,windowsHide:true});
  if(r.status!==0||!r.stdout?.trim())throw Error('Cannot resolve local Git ignore storage');
  return path.join(fs.realpathSync(r.stdout.trim()),'info','devcontrol-worktree-ignore');
}

function localPatternFile(root:string):string|null{
  const source=localWorktreeIgnoreFile(root);
  if(!fs.existsSync(source))return null;
  const parent=fs.lstatSync(path.dirname(source)),file=fs.lstatSync(source);
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
  return candidates.filter(file=>!exempt.has(file));
}
