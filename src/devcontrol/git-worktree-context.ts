import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export type GitWorktreeContext = {
  checkoutRoot:string;
  mainRoot:string;
  isLinked:boolean;
  commonGitDir:string;
};

function git(root:string,args:string[]):string{
  const result=spawnSync('git',args,{
    cwd:root,encoding:'utf8',timeout:12_000,windowsHide:true,
    env:{...process.env,GIT_TERMINAL_PROMPT:'0'},
  });
  if(result.status!==0||result.error)
    throw Error('Cannot inspect Git worktree: '+String(result.error?.message||
      result.stderr||'unknown error').slice(0,300));
  return result.stdout.trim();
}

/** Resolve only an existing, registered Git worktree. This NEVER creates,
 * changes, checks out, stages, merges, deletes or resets source code.
 * A linked checkout must use the SAME canonical project SQLite ledger.
 */
export function resolveGitWorktreeContext(input:string):GitWorktreeContext{
  const resolved=path.resolve(input);
  const checkoutRoot=fs.realpathSync(resolved);
  // macOS maps /var to /private/var. That ancestor alias is harmless;
  // reject an actual symlink at the checkout path, not at its parent.
  if(fs.lstatSync(resolved).isSymbolicLink()||
    !fs.statSync(checkoutRoot).isDirectory())
    throw Error('DevControl worktree root cannot be a symlink');
  if(fs.realpathSync(git(checkoutRoot,['rev-parse','--show-toplevel']))!==checkoutRoot)
    throw Error('DevControl requires the exact Git checkout root');
  const entries=git(checkoutRoot,['worktree','list','--porcelain'])
    .split(/\r?\n/).filter(line=>line.startsWith('worktree '))
    .map(line=>fs.realpathSync(path.resolve(line.slice('worktree '.length))));
  if(!entries.length||!entries.includes(checkoutRoot))
    throw Error('Checkout is not a registered Git worktree');
  const mainRoot=fs.realpathSync(entries[0]);
  if(entries[0]!==mainRoot||!fs.existsSync(path.join(mainRoot,'.git'))||
    !fs.statSync(mainRoot).isDirectory())
    throw Error('Canonical project worktree is not available');
  if(fs.realpathSync(git(mainRoot,['rev-parse','--show-toplevel']))!==mainRoot)
    throw Error('Canonical project root differs from Git worktree registry');
  const commonGitDir=fs.realpathSync(git(checkoutRoot,
    ['rev-parse','--path-format=absolute','--git-common-dir']));
  const mainCommonGitDir=fs.realpathSync(git(mainRoot,
    ['rev-parse','--path-format=absolute','--git-common-dir']));
  if(commonGitDir!==mainCommonGitDir)
    throw Error('Linked checkout is not attached to canonical project Git data');
  const gitMarker=path.join(checkoutRoot,'.git');
  if(fs.lstatSync(gitMarker).isSymbolicLink())
    throw Error('Symbolic-link Git metadata is not an authorized checkout');
  if(checkoutRoot!==mainRoot&&!fs.lstatSync(gitMarker).isFile())
    throw Error('A linked Git worktree must contain a Git metadata pointer file');
  return {checkoutRoot,mainRoot,isLinked:checkoutRoot!==mainRoot,commonGitDir};
}
