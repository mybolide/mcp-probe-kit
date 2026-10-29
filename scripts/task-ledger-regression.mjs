/** Full task-ledger regression in bounded, independent Vitest batches.
 * Never silently skip a test or count a timed-out batch as a pass.
 * Avoid a single uninterruptible, large task-ledger invocation in MCP hosts.
 */
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const file='src/devcontrol/__tests__/task-ledger.unit.test.ts';
const input=readFileSync(resolve(root,file),'utf8');
const titles=[...input.matchAll(/^\s*it\("([^"\n]+)"/gm)].map(m=>m[1]);
const declarations=[...input.matchAll(/^\s*(?:it|test)(?:\.[a-z]+)?\s*\(/gm)];
if(titles.length<40||new Set(titles).size!==titles.length||
    declarations.length!==titles.length)
  throw Error('Task-ledger test inventory changed; review the batch selector before executing');

const batchSize=14;
const count=Math.ceil(titles.length/batchSize);
const vitest=resolve(root,'node_modules/vitest/vitest.mjs');
if(!existsSync(vitest))throw Error('Run npm ci first to install the pinned Vitest version');
const scratch=mkdtempSync(join(tmpdir(),'task-ledger-regression-'));
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
let verified=0;
try{
  for(let i=0;i<count;i++){
    const batch=titles.slice(i*batchSize,(i+1)*batchSize);
    // Match complete leaf titles, not accidental substrings of other tests.
    const pattern='(?:'+batch.map(escapeRegExp).join('|')+')$';
    const output=join(scratch,`batch-${i+1}.json`);
    const started=Date.now();
    process.stdout.write(`[task-ledger] batch ${i+1}/${count}: ${batch.length} tests\n`);
    const run=spawnSync(process.execPath,[vitest,'run',file,
      '--testNamePattern',pattern,'--reporter=json','--outputFile',output,
      '--testTimeout=30000','--maxWorkers=1'],{
      cwd:root,encoding:'utf8',windowsHide:true,timeout:45000,
      maxBuffer:8_000_000,env:{...process.env,NO_COLOR:'1'},
    });
    if(run.error||run.status!==0){
      process.stderr.write((run.stdout||'').slice(-4000)+'\n'+(run.stderr||'').slice(-4000)+'\n');
      throw Error(`Task-ledger batch ${i+1}/${count} failed or timed out after ${Date.now()-started}ms`+
        (run.error?`: ${run.error.message}`:` (exit ${run.status}, signal ${run.signal})`));
    }
    if(!existsSync(output))throw Error(`Missing result artifact from batch ${i+1}`);
    const report=JSON.parse(readFileSync(output,'utf8'));
    const results=(report.testResults||[]).flatMap(suite=>suite.assertionResults||[]);
    const passed=results.filter(test=>test.status==='passed');
    const exact=new Set(passed.map(test=>test.title));
    if(passed.length!==batch.length||exact.size!==batch.length||
        batch.some(title=>!exact.has(title))||report.numFailedTests!==0){
      throw Error(`Batch ${i+1}: expected ${batch.length} unique passing ledger tests, got ${passed.length}`);
    }
    verified+=passed.length;
    process.stdout.write(`[task-ledger] batch ${i+1}/${count} passed in ${Date.now()-started}ms\n`);
  }
  if(verified!==titles.length)throw Error('Coverage mismatch: not all ledger tests executed');
  process.stdout.write(`[task-ledger] PASS ${verified}/${titles.length} tests across ${count} bounded batches\n`);
}finally{rmSync(scratch,{recursive:true,force:true});}
