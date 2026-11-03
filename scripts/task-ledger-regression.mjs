/** Full task-ledger regression in bounded, independent Vitest batches.
 * Never silently skip a test or count a timed-out batch as a pass.
 * Avoid a single uninterruptible, large task-ledger invocation in MCP hosts.
 */
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const file='src/devcontrol/__tests__/task-ledger.unit.test.ts';
const input=readFileSync(resolve(root,file),'utf8');
// Both quote styles, including .only/.skip, must be counted by the guard.
const titles=[...input.matchAll(/^\s*(?:it|test)(?:\.[a-z]+)?\s*\(\s*(['"])([^\r\n]*?)\1\s*,/gm)]
  .map(m=>m[2]);
const declarations=[...input.matchAll(/^\s*(?:it|test)(?:\.[a-z]+)?\s*\(/gm)];
if(titles.length<40||new Set(titles).size!==titles.length||
    declarations.length!==titles.length)
  throw Error('Task-ledger test inventory changed; review the batch selector before executing');

// Windows Git/SQLite fixture setup is significantly slower than on macOS.
// Keep every test in the inventory, but use smaller independent batches.
const batchSize=process.platform==='win32'?5:10;
const timeoutMs=process.platform==='win32'?180_000:120_000;
const count=Math.ceil(titles.length/batchSize);
const vitest=resolve(root,'node_modules/vitest/vitest.mjs');
if(!existsSync(vitest))throw Error('Run npm ci first to install the pinned Vitest version');
// CI may pin this to its artifact directory; the default stays private OS temp.
const scratch=mkdtempSync(join(process.env.MCP_PROBE_LEDGER_TEST_LOG_ROOT||tmpdir(),
  'task-ledger-regression-'));
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
let verified=0;
let failed=false;
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
      '--testTimeout=60000','--maxWorkers=1','--pool=threads'],{
      cwd:root,encoding:'utf8',windowsHide:true,timeout:timeoutMs,
      maxBuffer:16_000_000,env:{...process.env,NO_COLOR:'1'},
    });
    const elapsed=Date.now()-started;
    const report=existsSync(output)?JSON.parse(readFileSync(output,'utf8')):null;
    const results=(report?.testResults||[]).flatMap(suite=>suite.assertionResults||[]);
    const passed=results.filter(test=>test.status==='passed');
    const failures=results.filter(test=>test.status==='failed');
    const log=join(scratch,`batch-${i+1}.log`);
    writeFileSync(log,JSON.stringify({batch:i+1,total:batch.length,
      elapsedMs:elapsed,exitCode:run.status,signal:run.signal,
      spawnError:run.error?.message??null,passed:passed.length,
      failed:failures.map(test=>({name:test.fullName||test.title,
        messages:test.failureMessages})),
      stdout:run.stdout??'',stderr:run.stderr??''},null,2));
    process.stdout.write(`[task-ledger] batch ${i+1}/${count}: ${passed.length}/${batch.length} passed, ${failures.length} failed in ${elapsed}ms\n`);
    if(run.error||run.status!==0){
      failed=true;
      const cause=run.error?.code==='ETIMEDOUT'?'TIMEOUT':
        run.error?'SPAWN_ERROR':'TEST_FAILURE';
      process.stderr.write((run.stderr||'').slice(-4000)+'\n');
      throw Error(`Task-ledger batch ${i+1}/${count} ${cause} after ${elapsed}ms: `+
        (run.error?.message??`exit ${run.status}, signal ${run.signal}`)+
        `. Full batch JSON/logs retained in ${scratch}`);
    }
    if(!existsSync(output)){
      failed=true;
      throw Error(`Missing result artifact from batch ${i+1}. Logs: ${scratch}`);
    }
    const exact=new Set(passed.map(test=>test.title));
    if(passed.length!==batch.length||exact.size!==batch.length||
        batch.some(title=>!exact.has(title))||report.numFailedTests!==0){
      failed=true;
      throw Error(`Batch ${i+1}: expected ${batch.length} unique passing ledger tests, got ${passed.length}. Logs: ${scratch}`);
    }
    verified+=passed.length;
  }
  if(verified!==titles.length)throw Error('Coverage mismatch: not all ledger tests executed');
  process.stdout.write(`[task-ledger] PASS ${verified}/${titles.length} tests across ${count} bounded batches\n`);
}finally{
  // Keep both JSON assertions and the per-batch stdout/stderr log so a
  // Windows failure can be diagnosed after the terminal session ends.
  // mkdtemp creates a private OS-temp directory; no product state is touched.
  process[failed?'stderr':'stdout'].write(
    `[task-ledger] ${failed?'FAIL':'PASS'}: per-batch evidence retained at ${scratch}\n`);
}
