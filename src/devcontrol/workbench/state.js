  let project=null,board=null,features=[],featureTaskPlans=[],releaseWorkPlan=null,onboarding=null,releasePlan=null,localGit=null,insights=null,taskTab="not_started",taskVisibleLimit=12,reviewExpanded=false;
  const developerHint=()=>localGit?.name?
    localGit.name+" · "+(localGit.device||"") :
    (locale==="en"?"Git developer unavailable":"未识别本机 Git 开发身份");
  const titles={overview:"工作台",requirements:"需求管理",architecture:"技术架构",tasks:"任务管理",issues:"Bug 管理",history:"历史会话",docs:"文档中心",guide:"研发指南",settings:"设置"};
  const n=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined&&text!==null)x.textContent=translate(String(text));if(cls)x.className=cls;return x;};
  const fetchJSON=async url=>{const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return r.json();};
  let previousView=null;
  function setMobileNavExpanded(expanded){
    $('mobile-nav-more').setAttribute('aria-expanded',String(expanded));
    document.querySelector('.sidebar').classList.toggle('mobile-nav-expanded',expanded);
  }
  const router=createHashRouter(Object.keys(titles),view=>{
    document.querySelectorAll(".navbtn").forEach(e=>{
      const active=e.dataset.view===view;
      e.classList.toggle("active",active);
      if(active)e.setAttribute("aria-current","page");else e.removeAttribute("aria-current");
    });
    const docsLink=$("sidebar-docs");
    docsLink.classList.toggle("active",view==="docs");
    if(view==="docs")docsLink.setAttribute("aria-current","page");
    else docsLink.removeAttribute("aria-current");
    document.querySelectorAll(".view").forEach(e=>e.classList.toggle("active",e.id==="view-"+view));
    $("crumb").textContent=translate(titles[view]);
    if(['architecture','history','guide','settings'].includes(view))setMobileNavExpanded(true);
    else if(previousView!==view)setMobileNavExpanded(false);
    const autoRefresh=view==="overview"||view==="tasks";
    $("refresh-control").hidden=!autoRefresh;
    $("refresh-countdown").hidden=!autoRefresh;
    updateRefreshCountdown();
    // Switches between long pages should always start at the new page top;
    // normal data updates within a view must preserve the reading position.
    if(previousView!==null&&previousView!==view)window.scrollTo(0,0);
    previousView=view;
    if(view==="history")loadHistory();
    if(view==="architecture"){
      loadArchitectureChanges();
      loadDatabaseDesign();
    }
    if(view==="issues")loadIssues();
    if(view==="guide")loadGuide();
    if(view==="settings")loadSettings();
  });
  function go(view){router.go(view==="product"?"overview":view);}
