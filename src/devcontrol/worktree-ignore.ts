/** Local-only exception layer for untracked files in DevControl snapshots.
 *
 * Git's .gitignore, global excludes and info/exclude are authoritative first.
 * A small local rules file in the *actual* Git directory further excludes
 * untracked ordinary files, without altering Git status or versioned source.
 * It can never suppress staged/tracked edits or a frozen task path.
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

export function localWorktreeIgnoreFile(root:string):string{
  const r=spawnSync('git',['rev-parse','--absolute-git-dir'],{
    cwd:root,encoding:'utf8',timeout:12000,windowsHide:true});
  if(r.status!==0||!r.stdout?.trim())throw Error('Cannot resolve local Git ignore storage');
  return path.join(fs.realpathSync(r.stdout.trim()),'info','devcontrol-worktree-ignore');
}

/** Returns the untracked set that MUST be audited, with strict exemption
 * checks. Ignored Git files are already absent from the initial candidate set.
 */
export function auditedUntrackedFiles(root:string,
  inScope:(path:string)=>boolean=()=>false):string[]{
  const candidates=names(root,['ls-files','--others','--exclude-standard','-z']);
  const source=localWorktreeIgnoreFile(root);
  if(!fs.existsSync(source))return candidates;
  const parent=fs.lstatSync(path.dirname(source)),file=fs.lstatSync(source);
  if(!parent.isDirectory()||parent.isSymbolicLink()||!file.isFile()||
      file.isSymbolicLink()||file.size>65536)
    throw Error('Unsafe local worktree-ignore configuration');
  const remaining=names(root,['ls-files','--others','--exclude-standard',
    '--exclude-from='+source,'-z']);
  const visible=new Set(remaining),realRoot=fs.realpathSync(root);
  const lexicalRoot=path.resolve(root);
  for(const fileName of candidates.filter(name=>!visible.has(name))){
    if(inScope(fileName))
      throw Error('worktree-ignore cannot exempt a frozen task file: '+fileName);
    const full=path.resolve(root,fileName);
    if(!full.startsWith(lexicalRoot+path.sep))
      throw Error('worktree-ignore path outside repository: '+fileName);
    for(let folder=path.dirname(full);folder!==lexicalRoot;folder=path.dirname(folder)){
      if(!folder.startsWith(lexicalRoot+path.sep)||fs.lstatSync(folder).isSymbolicLink())
        throw Error('worktree-ignore cannot exempt symlink ancestry: '+fileName);
    }
    const stat=fs.lstatSync(full);
    if(!stat.isFile()||stat.isSymbolicLink()||
      !fs.realpathSync(full).startsWith(realRoot+path.sep))
      throw Error('worktree-ignore cannot exempt non-regular or linked files: '+fileName);
  }
  return remaining;
}
