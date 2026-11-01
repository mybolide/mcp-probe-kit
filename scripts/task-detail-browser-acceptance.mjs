/** Real Chrome acceptance of the read-only human/AI task detail on a live
 * DevControl workspace. No mutations to project tasks, Git or SQLite.
 * Example: node scripts/task-detail-browser-acceptance.mjs
 *   --url=http://127.0.0.1:38182/ --out=/tmp/neyna-task-preview
 */
import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=',2)));
const base=args.url||'http://127.0.0.1:38182/';
const out=resolve(args.out||join(tmpdir(),'devcontrol-task-detail-acceptance'));
mkdirSync(out,{recursive:true});
const chrome=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
if(!chrome)throw Error('Chrome missing, cannot claim visual acceptance');
const profile=mkdtempSync(join(tmpdir(),'devcontrol-task-views-'));
const proc=spawn(chrome,['--headless=new','--no-sandbox','--no-first-run',
  '--disable-gpu','--window-size=1400,960','--remote-debugging-port=0',
  '--remote-allow-origins=*','--user-data-dir='+profile,base+'#tasks'],
  {stdio:'ignore'});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
let socket,seq=1;
try{
  let port;
  for(let i=0;i<70;i++){
    const file=join(profile,'DevToolsActivePort');
    if(existsSync(file)){port=Number(readFileSync(file,'utf8').split('\n')[0]);break;}
    await sleep(150);
  }
  if(!port)throw Error('Chrome headless debugger did not start');
  let tab;
  for(let i=0;i<30;i++){
    const all=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    tab=all.find(entry=>entry.type==='page');
    if(tab)break;
    await sleep(150);
  }
  if(!tab)throw Error('No Chrome tab');
  socket=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((yes,no)=>{socket.onopen=yes;socket.onerror=no;});
  const send=(method,params={})=>new Promise((yes,no)=>{
    const id=seq++,timer=setTimeout(()=>no(Error('Chrome CDP timeout '+method)),18000);
    const receive=event=>{
      const msg=JSON.parse(event.data);
      if(msg.id!==id)return;
      clearTimeout(timer);socket.removeEventListener('message',receive);
      if(msg.error)no(Error(JSON.stringify(msg.error)));else yes(msg.result);
    };
    socket.addEventListener('message',receive);
    socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async code=>{
    const data=await send('Runtime.evaluate',{
      expression:code,returnByValue:true,awaitPromise:true});
    if(data.exceptionDetails)throw Error(data.exceptionDetails.text);
    return data.result.value;
  };
  const until=async (code,description)=>{
    for(let i=0;i<75;i++){
      const result=await evaluate(code);
      if(result)return result;
      await sleep(140);
    }
    throw Error('Timed out: '+description);
  };
  await send('Page.enable');
  const report=[];
  for(const width of [1400,390]){
    await send('Emulation.setDeviceMetricsOverride',{
      width,height:930,deviceScaleFactor:1,mobile:width===390});
    await send('Page.navigate',{url:base+'#tasks'});
    await until('document.querySelectorAll("#task-rows .task-card").length>0',
      'real SQLite task cards');
    const inventory=await(await fetch(new URL('api/task-readability',base))).json();
    await evaluate('document.querySelector("#task-readability-audit").open=true');
    await until('document.querySelector("#task-readability-count")?.textContent?.includes("项 ·")',
      'read-only project task completeness audit');
    const audited=await evaluate('document.querySelector("#task-readability-count").textContent');
    if(!audited.includes(String(inventory.total)+' 项'))
      throw Error('Task audit displayed a different project count: '+audited);
    const queue=await(await fetch(new URL('api/task-spec-review',base))).json();
    await evaluate('document.querySelector("#task-spec-review-queue").open=true');
    await until('document.querySelector("#task-spec-review-count")?.textContent?.includes("本批")',
      '12 independent frozen task review candidates');
    const selection=await evaluate('({count:document.querySelectorAll(".task-spec-review-item").length,visible:document.querySelector("#task-spec-review-count").textContent})');
    if(queue.policy!=='review-draft-no-mutation'||
      selection.count!==queue.items.length||queue.items.length>12||
      !selection.visible.includes('本批 '+queue.items.length+' 项'))
      throw Error('Task spec review queue not grounded in read-only API: '+JSON.stringify({queue,selection}));
    if(width===1400){
      const auditShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      writeFileSync(join(out,'task-readability-audit-1400.png'),
        Buffer.from(auditShot.data,'base64'));
      if(queue.items.length){
        await evaluate('document.querySelector(".task-spec-review-item").open=true');
        const reviewShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        writeFileSync(join(out,'task-spec-review-1400.png'),
          Buffer.from(reviewShot.data,'base64'));
      }
    }
    await evaluate('document.querySelector("#task-rows .task-card").click()');
    await until('document.querySelector(".task-contract-raw pre")?.textContent?.length>30',
      'original execution-contract JSON');
    const overview=await evaluate(`(()=>{
      const outer=document.querySelector('.overlay.task-detail-view');
      const current=[...document.querySelectorAll('.task-detail-tabs [role=tab]')]
        .find(b=>b.getAttribute('aria-selected')==='true');
      return {visible:!!outer,tab:current?.textContent,
        overviewVisible:!document.querySelector('#task-detail-overview').hidden,
        contractHidden:document.querySelector('#task-detail-contract').hidden,
        relationships:!!document.querySelector('.task-relations-details h3'),
        sections:document.querySelectorAll('#task-detail-overview section').length,
        drawerWidth:Math.round(document.querySelector('.drawer').getBoundingClientRect().width),
        viewport:window.innerWidth,
        title:document.querySelector('#doc-title').textContent};
    })()`);
    const match=/^([A-Z][A-Z0-9-]{1,39})\s*·/.exec(overview.title);
    if(!match)throw Error('Cannot identify real task from '+overview.title);
    const id=match[1];
    const actual=await(await fetch(new URL('api/tasks/'+id,base))).json();
    const human=await evaluate('document.querySelector("#task-detail-overview").textContent');
    if(!human.includes('任务说明完整性')||
      actual.readability?.requirementRefs?.length&&!human.includes('对应的产品需求'))
      throw Error('Task overview missing verified source or review guidance');
    await evaluate(`[...document.querySelectorAll('.task-detail-tabs [role=tab]')]
      .find(el=>el.textContent==='执行合同').click()`);
    const raw=await evaluate(`(()=>{
      const pre=document.querySelector('.task-contract-raw pre');
      const tabs=[...document.querySelectorAll('.task-detail-tabs [role=tab]')];
      return {data:JSON.parse(pre.textContent),
        grouped:document.querySelectorAll('.task-contract-group').length,
        contractVisible:!document.querySelector('#task-detail-contract').hidden,
        overviewHidden:document.querySelector('#task-detail-overview').hidden,
        active:tabs.find(t=>t.getAttribute('aria-selected')==='true')?.textContent,
        relationsVisible:!!document.querySelector('.task-relations-details h3')};
    })()`);
    const exact=JSON.stringify(raw.data)===JSON.stringify(actual.executionContract);
    if(!overview.visible||overview.tab!=='任务概览'||!overview.overviewVisible||
      !overview.contractHidden||!overview.relationships||overview.sections<4||
      overview.drawerWidth>width+1||!raw.contractVisible||!raw.overviewHidden||
      raw.active!=='执行合同'||raw.grouped<5||!raw.relationsVisible||!exact)
      throw Error('Human/AI task view mismatch: '+JSON.stringify({width,overview,
        contract:{...raw,data:undefined},exact}));
    await evaluate(`document.querySelector('.task-contract-raw').open=true`);
    const shot=await send('Page.captureScreenshot',{
      format:'png',captureBeyondViewport:false});
    const file=join(out,'task-contract-'+width+'.png');
    writeFileSync(file,Buffer.from(shot.data,'base64'));
    if(width===1400){
      await evaluate(`[...document.querySelectorAll('.task-detail-tabs [role=tab]')]
        .find(el=>el.textContent==='任务概览').click()`);
      const picture=await send('Page.captureScreenshot',{
        format:'png',captureBeyondViewport:false});
      writeFileSync(join(out,'task-overview-1400.png'),
        Buffer.from(picture.data,'base64'));
    }
    report.push({width,task:id,overview:overview.tab,contract:raw.active,
      readability:actual.readability?.status,projectScan:inventory.counts,
      specReviewCandidates:queue.totalCandidates,reviewBatchSize:queue.items.length,
      grouped:raw.grouped,exactExecutionContract:exact,sharedRelations:true,
      responsive:overview.drawerWidth<=width+1,screenshot:file});
  }
  console.log(JSON.stringify({ok:true,project:base,report}));
}finally{
  socket?.close();
  proc.kill('SIGTERM');
  await sleep(200);
  rmSync(profile,{recursive:true,force:true});
}
