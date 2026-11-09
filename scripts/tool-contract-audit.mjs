/** v5 read-only protocol and tool contract audit.
 * Audits the actual installed process and exact manifest surfaces instead of
 * calling retired v4 delegated-plan tools. The only writes are in a temporary
 * Git fixture; no project status, user source or Gate is modified. */
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const manifest=JSON.parse(await readFile('tools-manifest.json','utf8'));
const expected=manifest.toolsets;
const root=await mkdtemp(join(tmpdir(),'mcp-v5-contract-audit-'));
const entry=resolve('build/index.js');
const checks=[];
let client,transport;

function assert(ok,message){if(!ok)throw new Error(message);}
function record(name,passed,detail){checks.push({name,passed,detail});
  assert(passed,'v5 tool contract '+name+': '+detail);}
function compare(name,actual,wanted){
  const have=new Set(actual),target=new Set(wanted);
  const missing=[...target].filter(x=>!have.has(x));
  const unexpected=[...have].filter(x=>!target.has(x));
  record(name,actual.length===have.size&&missing.length===0&&unexpected.length===0,
    JSON.stringify({actual:actual.length,expected:target.size,missing,unexpected}));
}
async function connect({toolset='compact',memory=false}={}){
  const url='http://127.0.0.1:9';
  transport=new StdioClientTransport({
    command:process.execPath,args:[entry],cwd:process.cwd(),stderr:'pipe',
    env:{...process.env,MCP_PROJECT_ROOT:root,MCP_TOOLSET:toolset,
      MCP_HISTORY_SESSION:'1',MCP_DEVCONTROL_AUTOSTART:'0',
      MCP_ENABLE_GITNEXUS_BRIDGE:'0',MCP_ENABLE_UI_APPS:'0',
      MEMORY_QDRANT_URL:memory?url:'',MEMORY_QDRANT_COLLECTION:'audit',
      MEMORY_EMBEDDING_URL:memory?url+'/embed':'',
      MEMORY_EMBEDDING_MODEL:memory?'audit-embed':'',
      MEMORY_EMBEDDING_PROVIDER:'ollama'},
  });
  client=new Client({name:'v5-tool-audit',version:'1.0.0'},{capabilities:{}});
  client.setVersionNegotiation({mode:{pin:'2026-07-28'}});
  await client.connect(transport);
}
async function close(){
  await client?.close().catch(()=>undefined);
  await transport?.close().catch(()=>undefined);
  client=undefined;transport=undefined;
}
async function tool(name,args){
  const r=await client.callTool({name,arguments:args});
  record('call:'+name+':'+(args.action??'default'),
    r.isError!==true&&r.structuredContent!==undefined&&
      (r.content??[]).some(x=>x.type==='text'&&x.text.trim()),
    JSON.stringify({isError:r.isError??false,hasStructured:!!r.structuredContent}));
  return r.structuredContent;
}

try{
  // This is a throwaway Git project, not the user's local workspace.
  await writeFile(join(root,'README.md'),'# v5 tool contract fixture\n');
  execFileSync('git',['init','-q',root],{timeout:3000,windowsHide:true});
  execFileSync('git',['-C',root,'config','user.name','Audit Fixture'],{timeout:3000});
  execFileSync('git',['-C',root,'config','user.email','audit@example.invalid'],{timeout:3000});
  execFileSync('git',['-C',root,'add','README.md'],{timeout:3000});
  execFileSync('git',['-C',root,'commit','-qm','initial'],{timeout:3000});

  record('manifest-v5',manifest.version.startsWith('5.')&&manifest.totalTools===24,
    JSON.stringify({version:manifest.version,total:manifest.totalTools}));
  record('model-tools-disjoint',expected.compact.tools.every(x=>
    !expected.historyConditional.tools.includes(x)&&
    !expected.memoryConditional.tools.includes(x))&&
    expected.historyConditional.tools.every(x=>
      !expected.memoryConditional.tools.includes(x)),
    'Base, History, and Memory model tools must not overlap');
  record('retired-delegated-plan-absent',
    ['workflow','start_feature','resume_plan','plan_heartbeat','converge']
      .every(x=>!expected.compact.tools.includes(x)&&
        !expected.workflow.tools.includes(x)),
    'Retired v4 delegated-plan tools must not return in v5');

  record('base-compact-manifest',expected.compact.tools.length===10,
    'v5 retains 10 base tools and always adds mandatory SQLite History');
  await connect();
  let listed=(await client.listTools()).tools.map(x=>x.name);
  compare('compact-with-history',listed,expected.compactWithHistory.tools);
  const next=await tool('devcontrol',{action:'next',project_root:root,input:{}});
  record('next-is-read-only',next?.nextTask===null||next?.nextTask===undefined,
    'An empty project must not create or claim an unfinished task');
  await tool('devcontrol',{action:'guide',project_root:root,input:{intent:'task'}});
  const created=await tool('devcontrol',{action:'feature-create',project_root:root,
    input:{name:'contract-audit',description:'Temporary feature with explicit review'}});
  record('draft-is-not-approved',created?.status==='draft'&&created?.revision===1,
    'Creating a feature must never imply Owner approval or Verified evidence');
  const loaded=await tool('devcontrol',{action:'feature-get',project_root:root,
    input:{name:'contract-audit'}});
  record('feature-persisted',loaded?.revision===1&&loaded?.name==='contract-audit',
    'SQLite feature/get must return exactly the previously saved draft');
  await tool('history_session_bootstrap',{project_root:root,
    initial_user_input:'v5 contract audit',title:'Temporary audit history'});
  await close();

  await connect({memory:true});
  listed=(await client.listTools()).tools.map(x=>x.name);
  compare('compact-with-memory',listed,expected.compactWithHistoryAndMemory.tools);
  await close();

  await connect({toolset:'full'});
  listed=(await client.listTools()).tools.map(x=>x.name);
  record('app-only-hidden',expected.appOnly.tools.every(x=>!listed.includes(x)),
    'App-only tools must not appear as regular model tools');
  record('full-current-version',listed.length===24&&listed.includes('devcontrol'),
    'The full v5 surface must contain 24 active tools');
  // The full group declares a count, while its exact membership is the union
  // of base/History/Memory and active compatibility-only entries.
  const permitted=new Set([...expected.compactWithHistoryAndMemory.tools,
    ...expected.core.tools,...expected.ui.tools,...expected.workflow.tools]);
  compare('full-v5-tools',listed,[...permitted]);
  await close();

  console.log(JSON.stringify({passed:true,version:manifest.version,
    totals:{checks:checks.length,failed:0},checks},null,2));
} finally {
  await close();
  await rm(root,{recursive:true,force:true});
}
