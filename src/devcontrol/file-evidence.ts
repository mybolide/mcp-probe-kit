/** Git-independent source evidence for DevControl workspaces.
 *
 * The caller must capture a baseline BEFORE development and a delivery
 * snapshot AFTER development. A digest proves observed bytes, never invents
 * a Git commit, author, historical revision or independently passed test.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export type FileEvidenceEntry = {path:string; sha256:string; size:number};
export type FileEvidenceSnapshot = {
  kind:'files-sha256-v1';
  entries:FileEvidenceEntry[];
  digest:string;
};

const SKIP_DIRECTORIES=new Set([
  '.git','.hg','.svn','.mcp-probe-kit','node_modules','.dart_tool',
  '.next','.gradle','.venv','venv','Pods','build','dist','target','coverage',
]);
const MAX_FILES=10000;
const MAX_DIRECTORIES=25000;
const MAX_FILE_SIZE=32*1024*1024;
const MAX_TOTAL_BYTES=256*1024*1024;

function fingerprint(file:string,relative:string):FileEvidenceEntry{
  const before=fs.lstatSync(file);
  if(!before.isFile()||before.isSymbolicLink()||before.size>MAX_FILE_SIZE)
    throw Error('Unsafe file-evidence source entry: '+relative);
  const real=fs.realpathSync(file);
  if(real!==file)throw Error('Linked file-evidence source entry: '+relative);
  const noFollow=fs.constants.O_NOFOLLOW??0;
  const fd=fs.openSync(file,fs.constants.O_RDONLY|noFollow);
  try{
    const stat=fs.fstatSync(fd);
    if(!stat.isFile()||stat.size!==before.size||stat.dev!==before.dev||
        stat.ino!==before.ino||stat.size>MAX_FILE_SIZE)
      throw Error('File changed while fingerprinting: '+relative);
    const hash=createHash('sha256');
    const buffer=Buffer.allocUnsafe(64*1024);
    let total=0;
    while(true){
      const count=fs.readSync(fd,buffer,0,buffer.length,null);
      if(!count)break;
      total+=count;
      if(total>MAX_FILE_SIZE)throw Error('Oversized file-evidence entry: '+relative);
      hash.update(buffer.subarray(0,count));
    }
    if(total!==stat.size||fs.fstatSync(fd).size!==stat.size)
      throw Error('File changed while fingerprinting: '+relative);
    return {path:relative,sha256:hash.digest('hex'),size:total};
  }finally{fs.closeSync(fd);}
}

/** A bounded non-Git manifest. Never follows symlinks or writes project data. */
export function captureFileEvidence(root:string):FileEvidenceSnapshot{
  const workspace=path.resolve(root);
  if(!fs.existsSync(workspace)||fs.lstatSync(workspace).isSymbolicLink()||
      !fs.statSync(workspace).isDirectory())
    throw Error('File-evidence root must be a real project directory');
  const canonical=fs.realpathSync(workspace);
  const entries:FileEvidenceEntry[]=[];
  const pending:[string,string][]=[[canonical,'']];
  let directories=0,bytes=0;
  while(pending.length){
    if(++directories>MAX_DIRECTORIES)throw Error('File-evidence directory budget exceeded');
    const [folder,prefix]=pending.pop()!;
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      const relative=prefix?prefix+'/'+entry.name:entry.name;
      const full=path.join(folder,entry.name);
      if(entry.isDirectory()){
        if(SKIP_DIRECTORIES.has(entry.name)||
           (prefix==='.neyna'&&entry.name==='state'))continue;
        pending.push([full,relative]);
      }else if(entry.isSymbolicLink()){
        throw Error('File-evidence cannot follow project symlink: '+relative);
      }else if(entry.isFile()){
        const file=fingerprint(full,relative);
        bytes+=file.size;
        if(bytes>MAX_TOTAL_BYTES||entries.length>=MAX_FILES)
          throw Error('File-evidence project budget exceeded');
        entries.push(file);
      }else{
        throw Error('Unsupported file-evidence entry: '+relative);
      }
    }
  }
  entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  return {kind:'files-sha256-v1',entries,
    digest:createHash('sha256').update(JSON.stringify(entries)).digest('hex')};
}

export function compareFileEvidence(before:FileEvidenceSnapshot,after:FileEvidenceSnapshot):{
  added:string[];modified:string[];deleted:string[];changed:string[];
}{
  if(before.kind!=='files-sha256-v1'||after.kind!=='files-sha256-v1')
    throw Error('Unsupported file-evidence format');
  const old=new Map(before.entries.map(item=>[item.path,item]));
  const latest=new Map(after.entries.map(item=>[item.path,item]));
  const added=after.entries.filter(item=>!old.has(item.path)).map(item=>item.path);
  const modified=after.entries.filter(item=>{
    const original=old.get(item.path);
    return !!original&&(item.sha256!==original.sha256||item.size!==original.size);
  }).map(item=>item.path);
  const deleted=before.entries.filter(item=>!latest.has(item.path)).map(item=>item.path);
  return {added,modified,deleted,changed:[...added,...modified,...deleted].sort()};
}
