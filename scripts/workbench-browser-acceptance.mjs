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
 for(const width of [1500,1024,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
  for(const view of views){
   await send('Page.navigate',{url:url+'#'+view});
   let v;
   for(let i=0;i<50;i++){
    await sleep(130);
    const expr='(()=>{const s=document.querySelector("#view-'+view+'");const h=s?.querySelector("h1");return {active:!!s?.classList.contains("active"),font:parseFloat(getComputedStyle(document.body).fontSize),titleSize:h?parseFloat(getComputedStyle(h).fontSize):0,scrollWidth:document.documentElement.scrollWidth,cardCount:document.querySelectorAll(".task-card").length}})()';
    v=await evalJS(expr);
    if(v?.active)break;
   }
   results.push({view,width,...v});
   if(width===1500||view==='tasks'||view==='settings'){
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const file=join(out,view+'-'+width+'.png');
    writeFileSync(file,Buffer.from(shot.data,'base64'));files.push(file);
   }
  }
 }
 const failures=results.filter(v=>!v.active||v.font<14||v.titleSize<27||v.scrollWidth>v.width+3);
 if(!results.some(v=>v.view==='tasks'&&v.width===1500&&v.cardCount>0))failures.push({reason:'Task list did not render'});
 process.stdout.write(JSON.stringify({ok:failures.length===0,results,failures,files})+'\n');
 if(failures.length)process.exitCode=1;
}finally{
 socket?.close();proc.kill('SIGTERM');await sleep(250);rmSync(profile,{recursive:true,force:true});
}
