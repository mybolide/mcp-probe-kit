/** Real v5 Agent acceptance, isolated from the developer's workspace.
 * No delegated-plan or phantom Gate approval may substitute for SQLite. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { COMPACT_WITH_HISTORY_TOOL_COUNT, PACKAGE_VERSION } from './release-surface.mjs';

const projectRoot=await mkdtemp(join(tmpdir(),'mcp-v5-agent-acceptance-'));
let client,transport;
const assert=(ok,message)=>{if(!ok)throw Error(message);};
try {
  await writeFile(join(projectRoot,'README.md'),'# Disposable AI project\n');
  execFileSync('git',['init','-q',projectRoot],{timeout:3000});
  execFileSync('git',['-C',projectRoot,'config','user.name','Agent Acceptance'],{timeout:3000});
  execFileSync('git',['-C',projectRoot,'config','user.email','accept@example.invalid'],{timeout:3000});
  execFileSync('git',['-C',projectRoot,'add','README.md'],{timeout:3000});
  execFileSync('git',['-C',projectRoot,'commit','-qm','initial'],{timeout:3000});

  transport=new StdioClientTransport({command:process.execPath,
    args:['build/index.js'],cwd:process.cwd(),stderr:'pipe',
    env:{...process.env,MCP_TOOLSET:'compact',MCP_HISTORY_SESSION:'1',
      MCP_DEVCONTROL_AUTOSTART:'0',MCP_ENABLE_GITNEXUS_BRIDGE:'0',
      MEMORY_QDRANT_URL:'',MEMORY_EMBEDDING_URL:'',MEMORY_EMBEDDING_MODEL:''}});
  client=new Client({name:'v5-independent-agent',version:PACKAGE_VERSION},
    {capabilities:{}});
  client.setVersionNegotiation({mode:{pin:'2026-07-28'}});
  await client.connect(transport);
  const listed=(await client.listTools()).tools.map(x=>x.name);
  assert(listed.length===COMPACT_WITH_HISTORY_TOOL_COUNT&&
    listed.includes('devcontrol')&&listed.includes('history_session_bootstrap')&&
    !listed.includes('workflow')&&!listed.includes('converge'),
    'AI client must see the v5 tools, not retired delegated-plan tools');
  async function call(action,input={}){
    const r=await client.callTool({name:'devcontrol',arguments:{
      action,project_root:projectRoot,input}});
    assert(r.isError!==true&&r.structuredContent!==undefined,
      `v5 Agent ${action} did not return structured success`);
    return r.structuredContent;
  }
  const first=await call('next');
  assert(!first.nextTask,'An empty project must not be assigned a phantom task');
  const guide=await call('guide',{intent:'feature'});
  assert(guide.hasSideEffects===false,'Agent guidance must never mutate tasks');
  const draft=await call('feature-create',{
    name:'agent-acceptance',description:'User-requested idea awaiting actual owner approval',
  });
  assert(draft.status==='draft'&&draft.revision===1,
    'Draft creation cannot automatically approve, commit or verify a feature');
  const loaded=await call('feature-get',{name:'agent-acceptance'});
  assert(loaded.revision===1&&loaded.status==='draft',
    'A separate AI call must retrieve the exact SQLite draft without promoted status');
  const second=await call('next');
  assert(!second.nextTask,'A draft proposal must not become executable work');

  const history=await client.callTool({name:'history_session_bootstrap',
    arguments:{project_root:projectRoot,
      initial_user_input:'Please keep this proposal as a draft',
      title:'Disposable agent continuity'}});
  assert(history.isError!==true&&history.structuredContent,
    'History must remain available without any separate plan-heartbeat gate');
  console.log(JSON.stringify({passed:true,version:PACKAGE_VERSION,
    clientEra:client.getProtocolEra(),modelTools:listed.length,
    draftPreserved:true,unapprovedTaskRemainsUnclaimable:true,
    historySupported:true,retiredV4ToolsAbsent:true},null,2));
} finally {
  await client?.close().catch(()=>undefined);
  await transport?.close().catch(()=>undefined);
  await rm(projectRoot,{recursive:true,force:true});
}
