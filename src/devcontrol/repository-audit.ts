/**
 * Multi-repository Git evidence for one DevControl workspace.
 *
 * Repositories are discovered ONLY along frozen task scope prefixes. A Git
 * repository is never inferred from a gitlink in the parent index. We inspect
 * its own index and commit graph. This module is deliberately independent of
 * any particular product or folder name.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export type RepositoryRevision = {
  prefix:string; gitDir:string; baseHead:string; head:string;
};
export type RepositoryIdentity = {prefix:string; gitDir:string; root:string};

function git(cwd:string,args:string[],binary=false):Buffer {
  const result=spawnSync('git',args,{
    cwd,encoding:'buffer',windowsHide:true,timeout:15_000,maxBuffer:8_000_000,
    env:{...process.env,GIT_TERMINAL_PROMPT:'0'},
  });
  if(result.status!==0||!Buffer.isBuffer(result.stdout))
    throw Error(`Git audit unavailable in ${cwd}: ${result.stderr?.toString('utf8').slice(0,500)||result.error?.message||'unknown error'}`);
  return result.stdout;
}
function output(cwd:string,args:string[]):string{return git(cwd,args).toString('utf8').trim();}
function contained(workspace:string,location:string):boolean{
  return location===workspace||location.startsWith(workspace+path.sep);
}
function identity(workspace:string,prefix:string):RepositoryIdentity{
  const candidate=path.resolve(workspace,prefix);
  const real=fs.realpathSync(candidate);
  if(!contained(workspace,real)||real!==candidate||!fs.statSync(real).isDirectory())
    throw Error(`Unsafe repository location: ${prefix}`);
  if(fs.lstatSync(path.join(candidate,'.git')).isSymbolicLink())
    throw Error(`Symlinked Git metadata is not an approved repository identity: ${prefix}`);
  // git --show-toplevel is an independent check against a .git symlink,
  // misidentified worktree, or arbitrary subdirectory of a parent repository.
  const top=fs.realpathSync(output(real,['rev-parse','--show-toplevel']));
  if(top!==candidate)throw Error(`Not an independent Git root: ${prefix}`);
  const gitDir=fs.realpathSync(output(real,['rev-parse','--absolute-git-dir']));
  return {prefix,root:candidate,gitDir};
}
export function discoverRepositories(root:string,allowedPaths:string[]):RepositoryIdentity[]{
  const workspace=fs.realpathSync(root);
  const found=new Map<string,RepositoryIdentity>();
  found.set('',identity(workspace,''));
  // Also inspect independent sibling repositories that were not mentioned in
  // this task. Otherwise a task targeting service A could silently ignore a
  // staged/committed change in service B. The search is bounded, never follows
  // symlinks, and ignores generated dependency trees. Approved path prefixes
  // below still allow deeper explicitly scoped repositories.
  const ignoredGenerated=new Set([
    '.git','.neyna','.mcp-probe','.mcp-probe-kit','node_modules',
    '.dart_tool','.next','.build','build','dist','target','vendor',
    '.venv','venv','coverage','.gradle','Pods',
  ]);
  const pending:[string,number][]=[[workspace,0]];
  let visited=0;
  for(let cursor=0;cursor<pending.length;cursor++){
    const [dir,depth]=pending[cursor];
    if(++visited>3000)throw Error('Workspace Git repository discovery exceeded safe directory budget');
    if(depth>=3)continue;
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      if(!entry.isDirectory()||ignoredGenerated.has(entry.name))continue;
      const candidate=path.join(dir,entry.name);
      const prefix=path.relative(workspace,candidate).split(path.sep).join('/');
      if(fs.existsSync(path.join(candidate,'.git'))){
        found.set(prefix,identity(workspace,prefix));
      }
      pending.push([candidate,depth+1]);
    }
  }
  for(const frozen of allowedPaths){
    if(!frozen||path.posix.isAbsolute(frozen)||frozen.includes('\\')||
      frozen.split('/').some(part=>part===''||part==='.'||part==='..'))
      throw Error(`Unsafe frozen path: ${frozen}`);
    const segments=frozen.replace(/\/\*\*$/,'').split('/');
    // For exact file scopes, the final segment may be a file. A terminal
    // directory can be a repository too, so inspect its marker if present.
    for(let i=1;i<=segments.length;i++){
      const prefix=segments.slice(0,i).join('/');
      const candidate=path.resolve(workspace,prefix);
      if(!contained(workspace,candidate)||!fs.existsSync(candidate))break;
      const stat=fs.lstatSync(candidate);
      if(stat.isSymbolicLink())throw Error(`Symlink inside frozen scope: ${prefix}`);
      if(!stat.isDirectory())break;
      if(!fs.existsSync(path.join(candidate,'.git')))continue;
      found.set(prefix,identity(workspace,prefix));
    }
  }
  return [...found.values()].sort((a,b)=>a.prefix<b.prefix?-1:a.prefix>b.prefix?1:0);
}

export function currentRevisions(repos:RepositoryIdentity[]):RepositoryRevision[]{
  return repos.map(repo=>({prefix:repo.prefix,gitDir:repo.gitDir,
    baseHead:output(repo.root,['rev-parse','HEAD']),head:output(repo.root,['rev-parse','HEAD'])}));
}
export function updateRevisions(root:string,baselines:RepositoryRevision[]):RepositoryRevision[]{
  const workspace=fs.realpathSync(root);
  return baselines.map(saved=>{
    const current=identity(workspace,saved.prefix);
    if(current.gitDir!==saved.gitDir)throw Error(`Repository identity changed: ${saved.prefix}`);
    const head=output(current.root,['rev-parse','HEAD']);
    const ancestor=spawnSync('git',['merge-base','--is-ancestor',saved.baseHead,head],
      {cwd:current.root,windowsHide:true,timeout:12_000});
    if(ancestor.status!==0)throw Error(`Repository history changed: ${saved.prefix}`);
    return {...saved,head};
  });
}
export function revisionDigest(revisions:RepositoryRevision[]):string{
  return createHash('sha256').update(JSON.stringify(revisions.map(r=>
    [r.prefix,r.gitDir,r.baseHead,r.head]))).digest('hex');
}
function names(repo:RepositoryIdentity,args:string[]):string[]{
  return git(repo.root,args).toString('utf8').split('\0').filter(Boolean).map(name=>
    repo.prefix?repo.prefix+'/'+name:name).sort();
}
export function stagedChanges(repos:RepositoryIdentity[]):string[]{
  const paths=repos.flatMap(repo=>names(repo,
    ['diff','--cached','--no-renames','--name-only','-z','--diff-filter=ACMRTD']));
  return [...new Set(paths.filter(file=>
    !repos.some(child=>!!child.prefix&&file===child.prefix)))].sort();
}
export function committedChanges(root:string,revisions:RepositoryRevision[],filter='ACMRTD'):string[]{
  const workspace=fs.realpathSync(root);
  return [...new Set(revisions.flatMap(revision=>{
    const repo=identity(workspace,revision.prefix);
    if(repo.gitDir!==revision.gitDir)throw Error(`Repository identity changed: ${revision.prefix}`);
    return names(repo,['diff','--no-renames','--name-only','-z',
      '--diff-filter='+filter,revision.baseHead,revision.head]);
  }).filter(file=>!revisions.some(child=>child.prefix&&file===child.prefix)))].sort();
}

/** Validate no unexpected Git root was added or removed along frozen paths. */
export function assertRepositoryTopology(root:string,paths:string[],saved:RepositoryRevision[]):void{
  const current=discoverRepositories(root,paths);
  if(JSON.stringify(current.map(x=>[x.prefix,x.gitDir]))!==
    JSON.stringify(saved.map(x=>[x.prefix,x.gitDir])))
    throw Error('Frozen Git repository topology changed; re-review task baselines');
}
