  let project=null,board=null,features=[],featureTaskPlans=[],releaseWorkPlan=null,onboarding=null,releasePlan=null,localGit=null,taskTab="not_started",reviewExpanded=false;
  const developerHint=()=>localGit?.name?
    localGit.name+" · "+(localGit.device||"") :
    (locale==="en"?"Git developer unavailable":"未识别本机 Git 开发身份");
  const titles={overview:"工作台",product:"产品与目标",requirements:"需求管理",architecture:"技术架构",tasks:"任务管理",issues:"Bug 管理",history:"历史会话",docs:"文档中心",guide:"研发指南",settings:"设置"};
  const n=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined&&text!==null)x.textContent=translate(String(text));if(cls)x.className=cls;return x;};
  const fetchJSON=async url=>{const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return r.json();};
  const router=createHashRouter(Object.keys(titles),view=>{
    document.querySelectorAll(".navbtn").forEach(e=>e.classList.toggle("active",e.dataset.view===view));
    document.querySelectorAll(".view").forEach(e=>e.classList.toggle("active",e.id==="view-"+view));
    $("crumb").textContent=translate(titles[view]);
    if(view==="history")loadHistory();
    if(view==="issues")loadIssues();
    if(view==="guide")loadGuide();
    if(view==="settings")loadSettings();
  });
  function go(view){router.go(view);}
