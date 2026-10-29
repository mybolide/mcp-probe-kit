import {spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=',2)));
const url=args.url||'http://127.0.0.1:38180/';
const out=resolve(args.out||join(tmpdir(),'workbench-visual-review'));
mkdirSync(out,{recursive:true});
const chromePath=[process.env.CHROME_BIN,
'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(existsSync);
if(!chromePath)throw Error('Chrome unavailable');
const profile=mkdtempSync(join(tmpdir(),'mcp-v5-review-'));
const proc=spawn(chromePath,['--headless=new','--no-sandbox','--no-first-run',
'--disable-gpu','--window-size=1500,1000','--remote-debugging-port=0',
'--remote-allow-origins=*','--user-data-dir='+profile,url+'#overview'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let socket,seq=1;
try {
 let port;
 for(let i=0;i<75;i++){
  const p=join(profile,'DevToolsActivePort');
  if(existsSync(p)){port=Number(readFileSync(p,'utf8').split('\n')[0]);break;}
  await sleep(150);
 }
 if(!port)throw Error('Chrome did not start');
 let tab;
 for(let i=0;i<35;i++){
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  tab=tabs.find(t=>t.type==='page');if(tab)break;await sleep(150);
 }
 socket=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((ok,err)=>{socket.onopen=ok;socket.onerror=err;});
 const send=(method,params={})=>new Promise((ok,err)=>{
  const id=seq++;
  const tm=setTimeout(()=>err(Error('CDP timeout '+method)),16000);
  const h=e=>{const data=JSON.parse(e.data);if(data.id!==id)return;
   clearTimeout(tm);socket.removeEventListener('message',h);
   if(data.error)err(Error(JSON.stringify(data.error)));else ok(data.result);};
  socket.addEventListener('message',h);
  socket.send(JSON.stringify({id,method,params}));
 });
 const evalJS=async expr=>(await send('Runtime.evaluate',{expression:expr,returnByValue:true})).result.value;
 await send('Page.enable');
 const views=['overview','requirements','architecture','tasks','issues','history','guide','settings'];
 const results=[],files=[];
 const requestedWidths=(args.widths||'1500,1920,2560,1024,768,390')
   .split(',').map(Number).filter(Number.isFinite);
 for(const width of requestedWidths){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
  for(const view of views){
   if(args.debug==='true')process.stderr.write('checking '+width+' '+view+'\n');
   await send('Page.navigate',{url:url+'#'+view});
   let v;
   for(let i=0;i<50;i++){
    await sleep(130);
    const expr='(()=>{const s=document.querySelector("#view-'+view+'");const h=s?.querySelector("h1");const main=document.querySelector(".main");const task=document.querySelector(".task-collection");const nav=document.querySelector(".nav");return {active:!!s?.classList.contains("active"),font:parseFloat(getComputedStyle(document.body).fontSize),titleSize:h?parseFloat(getComputedStyle(h).fontSize):0,scrollWidth:document.documentElement.scrollWidth,mainRight:Math.round(main?.getBoundingClientRect().right||0),taskCols:task?getComputedStyle(task).gridTemplateColumns.split(" ").length:0,navWidth:nav?.clientWidth,navScroll:nav?.scrollWidth,hasPlanning:!!document.getElementById("vision-title")&&!!document.getElementById("roadmap-title")&&!!document.getElementById("okr-title"),hasArchChanges:!!document.getElementById("architecture-changes"),navItems:document.querySelectorAll(".navbtn").length,cardCount:document.querySelectorAll(".task-card").length}})()';
    v=await evalJS(expr);
    if(v?.active)break;
   }
   // A rendered shell alone is not a meaningful visual acceptance.
   // Wait for the actual project data before capturing and scoring content.
   if(['overview','requirements','architecture'].includes(view)){
     let loaded=false;
     for(let k=0;k<35;k++){
       loaded=await evalJS('(()=>{const view="'+view+'";if(view==="overview")return !document.getElementById("project-intro").textContent.includes("正在读取");if(view==="requirements")return document.getElementById("fr-count").textContent!=="—";return !document.getElementById("architecture-summary").textContent.includes("读取中");})()');
       if(loaded)break;
       await sleep(115);
     }
     v.dataLoaded=loaded;
   }
   // Check rendered project-derived management facts, not merely DOM shells.
   // The old visual gate only checked fonts and could miss an empty screen.
   const insightSelector={overview:'#overview-insight-metrics .insight-metric',
     requirements:'#idea-list .insight-row',tasks:'#task-granularity .insight-metric',
     issues:'#bug-insight-metrics .insight-metric',
     guide:'#guide-project-context .insight-row',
     settings:'#settings-diff .insight-list,.settings-change-panel .insight-list'}[view];
   if(insightSelector){
     let insightsLoaded=false;
     for(let k=0;k<40;k++){
       insightsLoaded=await evalJS('document.querySelectorAll('+JSON.stringify(insightSelector)+').length>0');
       if(insightsLoaded)break;
       await sleep(120);
     }
     v.insightsLoaded=insightsLoaded;
   }
   if(view==='architecture'){
     let reviewLoaded=false;
     for(let k=0;k<30;k++){
       reviewLoaded=await evalJS('document.getElementById("architecture-change-count").textContent!=="读取中…"');
       if(reviewLoaded)break;
       await sleep(100);
     }
     v.reviewLoaded=reviewLoaded;
   }
   if(view==='tasks'){
     v.footerLayout=await evalJS(`(()=>{
       const cards=[...document.querySelectorAll('#task-rows .task-card')].slice(0,12);
       if(!cards.length)return {checked:0,broken:0};
       const broken=cards.filter(card=>{
         const owner=card.querySelector('.task-card-owner-value');
         const detail=card.querySelector('.task-card-detail');
         if(!owner||!detail)return true;
         const a=owner.getBoundingClientRect(),b=detail.getBoundingClientRect();
         const style=getComputedStyle(owner);
         const tall=a.height>parseFloat(style.lineHeight)*1.8;
         return a.width<65||b.width<48||tall||a.right>b.left;
       });
       const first=cards[0];const owner=first.querySelector('.task-card-owner-value');
       const detail=first.querySelector('.task-card-detail');
       const coords=element=>{const r=element.getBoundingClientRect();return [Math.round(r.left),Math.round(r.right),Math.round(r.width),Math.round(r.height)];};
       return {checked:cards.length,broken:broken.length,
         sample:{owner:coords(owner),detail:coords(detail),
           footerStyle:getComputedStyle(first.querySelector('.task-card-side')).display}};
     })()`);
   }
   results.push({view,width,...v});
   if(args.debug==='true')process.stderr.write('checked '+width+' '+view+' loaded='+v.insightsLoaded+'\n');
   if(width===1500||width===2560&&view==='tasks'||width===1920&&view==='overview'||width===390&&['tasks','overview','settings','architecture'].includes(view)){
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const file=join(out,view+'-'+width+'.png');
    writeFileSync(file,Buffer.from(shot.data,'base64'));files.push(file);
   }
  }
 }
 const failures=results.filter(v=>v.dataLoaded===false||v.insightsLoaded===false||v.reviewLoaded===false||!v.active||v.font<14||v.titleSize<27||v.scrollWidth>v.width+3||v.navItems!==8
 ||v.mainRight<v.width-3 ||(v.view==='overview'&&!v.hasPlanning)
 ||(v.view==='architecture'&&!v.hasArchChanges)
 ||(v.view==='tasks'&&v.width>=1920&&v.taskCols<2)
 ||(v.view==='tasks'&&v.footerLayout?.broken>0)
 ||(v.width===390&&v.navScroll>v.navWidth+3));
 if(!results.some(v=>v.view==='tasks'&&v.width===1500&&v.cardCount>0))failures.push({reason:'Task list did not render'});
 process.stdout.write(JSON.stringify({ok:failures.length===0,results,failures,files})+'\n');
 if(failures.length)process.exitCode=1;
}finally{
 socket?.close();proc.kill('SIGTERM');await sleep(250);rmSync(profile,{recursive:true,force:true});
}
