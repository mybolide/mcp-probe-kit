  function renderOnboarding(){
    const panel=$("onboarding-panel");
    if(!onboarding){panel.classList.add("hide");return;}
    panel.classList.toggle("hide",onboarding.readiness==="ready_for_review");
    const fresh=onboarding.kind==="new";
    $("onboarding-title").textContent=fresh?"新项目首次接入":"已有项目基线核对";
    $("onboarding-next").textContent="下一步："+onboarding.nextAction+
      "。该清单仅检查真实 Git 与 SQLite 状态，不自动创建或批准任务。";
    $("onboarding-steps").replaceChildren(...onboarding.steps.map(step=>{
      const row=n("div",null,"onboardrow");
      const detail=n("div");detail.append(n("b",step.label),
        n("small",step.source||step.suggestedPath||step.instruction));
      row.append(detail,n("span",step.status==="present"?"已找到":"待确认","taskid"));
      return row;
    }));
  }
  function render(){
    $("projectcrumb").textContent=project.name;
    $("projectname").textContent=project.name.toUpperCase();
    $("projectstate").textContent=project.projectStatus==="documented"?"核心文档已建立":"基础文档不完整";
    $("branch").textContent="Git · "+(project.git.branch||"未识别")+" · "+(project.git.head||"无提交");
    $("project-intro").textContent=project.vision.summary||"项目愿景尚未建立，建议先维护权威文档，而不是由 Agent 编造项目介绍。";
    $("vision-title").textContent=project.vision.title;
    $("vision-summary").textContent=project.vision.summary||"产品愿景尚未建立。";
    $("roadmap-title").textContent=project.roadmap.title;
    $("roadmap-summary").textContent=project.roadmap.summary||"路线图尚未建立。";
    $("roadmap-source").textContent=project.roadmap.source;
    $("okr-title").textContent=project.okr.title;
    $("okr-summary").textContent=project.okr.summary||"本项目暂未建立可读取的阶段目标。";
    $("okr-source").textContent=project.okr.source;
    $("requirements-title").textContent=project.requirements.title;
    $("fr-count").textContent=String(project.requirements.frCount);
    $("nfr-count").textContent=String(project.requirements.nfrCount);
    $("architecture-title").textContent=project.architecture.title;
    $("architecture-summary").textContent=project.architecture.summary||"架构文档尚未建立。";
    $("architecture-diagram").textContent=project.architecture.diagram;
    $("architecture-diagram").classList.toggle("hide",!project.architecture.diagram);
    // Governance tasks must not inflate the perceived product delivery rate.
    const all=Object.values(board.columns).flat();
    const productTasks=currentReleaseRows();
    const verifiedTasks=productTasks.filter(row=>taskBucket(row)==="completed").length;
    const governance=all.filter(t=>t.track==="governance");
    $("s-total").textContent=String(productTasks.length);
    $("s-done").textContent=String(verifiedTasks);
    $("s-active").textContent=String(productTasks.filter(t=>taskBucket(t)==="in_progress").length);
    $("s-pending").textContent=String(productTasks.filter(t=>taskBucket(t)==="not_started").length);
    $("task-progress-bar").max=Math.max(1,productTasks.length);
    $("task-progress-bar").value=verifiedTasks;
    $("task-progress-label").textContent="正式工作项已验证 "+verifiedTasks+" / "+productTasks.length+
      "（"+(productTasks.length?(100*verifiedTasks/productTasks.length).toFixed(1):"0.0")+
      "%）。仅表示工作项 Verified，不代表产品发布 Gate 已通过。";
    $("governance-count").textContent="工程治理 · "+governance.filter(t=>t.status==="verified").length+"/"+governance.length+" 完成";
    $("next-id").textContent=board.current||"暂无可领取任务";
    const candidate=all.find(t=>t.id===board.current);
    const productNext=all.filter(t=>t.track==="product")
      .find(t=>t.status!=="verified"&&!t.blockedBy.length&&!t.unverifiedChildren.length);
    $("next-title").textContent=candidate?.title||"暂无可执行任务";
    $("next-detail").textContent=candidate?
      ("版本："+candidate.release+" · 状态："+candidate.status+
        (candidate.blockedBy.length?" · 前置依赖："+candidate.blockedBy.join("、"):"")+
        (candidate.track!=="product"&&productNext?" · 产品主线下一任务："+productNext.id+"（待当前任务结束后领取）":"")):
      "当前无符合依赖条件的任务；可在任务列表查看工作进度。";
    setupDocs();
    renderOnboarding();
    renderReleaseReview();
    renderTaskList();
    renderFeatures();
    renderInsights();
    $("synced").textContent="同步于 "+new Date().toLocaleTimeString();
  }
  let reloadInProgress=false;
  const refreshChoices=new Set([5,10,30,60]);
  let refreshSeconds=10,refreshRemaining=10;
  try{
    const stored=Number(localStorage.getItem('devcontrol-refresh-seconds'));
    if(refreshChoices.has(stored))refreshSeconds=stored;
  }catch{}
  refreshRemaining=refreshSeconds;
  $('refresh-interval').value=String(refreshSeconds);
  function updateRefreshCountdown(){
    const active=router.current()==='tasks'||router.current()==='overview';
    $('refresh-countdown').textContent=active?
      (refreshRemaining+' 秒后刷新'):'仅工作台与任务管理自动刷新';
  }
  function resetRefreshClock(){refreshRemaining=refreshSeconds;updateRefreshCountdown();}
  async function loadBrandVersion(){
    try{
      const meta=await fetchJSON('/api/meta');
      const version=meta.version?'v'+String(meta.version).replace(/^v/,''):'版本未知';
      $('brand-version').textContent=version;
      $('footer-version').textContent=version;
    }catch{
      $('brand-version').textContent='本地版本';
      $('footer-version').textContent='本地版本';
    }
  }
  async function reload(){
    if(reloadInProgress)return;
    reloadInProgress=true;
    try{const [nextProject,nextBoard,nextFeatures,nextFeatureTaskPlans,nextReleaseWorkPlan,nextOnboarding,nextReleasePlan,nextDeveloper,nextInsights]=await Promise.all([
      fetchJSON("/api/project"),fetchJSON("/api/board"),fetchJSON("/api/features"),
      fetchJSON("/api/feature-task-plans"),fetchJSON("/api/release-work-plan"),
      fetchJSON("/api/onboarding"),
      fetchJSON("/api/release-plan"),fetchJSON("/api/local-developer"),
      fetchJSON('/api/insights').catch(()=>null)]);
      project=nextProject;board=nextBoard;features=nextFeatures.features||[];
      featureTaskPlans=nextFeatureTaskPlans.plans||[];
      releaseWorkPlan=nextReleaseWorkPlan;
      onboarding=nextOnboarding;releasePlan=nextReleasePlan;localGit=nextDeveloper;
      insights=nextInsights;render();}
    catch(e){$("synced").textContent="同步失败："+e.message+"；保留上一次结果";}
    finally{reloadInProgress=false;resetRefreshClock();}
  }
  let lastTaskSnapshot='';
  let taskRefreshInProgress=false;
  async function refreshTaskData(){
    if(taskRefreshInProgress||reloadInProgress)return;
    taskRefreshInProgress=true;
    try{
      const [nextBoard,nextPlans,nextWork,nextRelease]=await Promise.all([
        fetchJSON('/api/board'),fetchJSON('/api/feature-task-plans'),
        fetchJSON('/api/release-work-plan'),fetchJSON('/api/release-plan'),
      ]);
      const digest=JSON.stringify([nextBoard,nextPlans,nextWork,nextRelease]);
      if(digest===lastTaskSnapshot)return;
      lastTaskSnapshot=digest;
      board=nextBoard;featureTaskPlans=nextPlans.plans||[];
      releaseWorkPlan=nextWork;releasePlan=nextRelease;
      // Only task components are replaced. The browser document, active Hash
      // route, filters, current task tab and any open details drawer survive.
      const scroll=document.scrollingElement?.scrollTop||0;
      renderTaskList();
      const rows=currentReleaseRows(),passed=rows.filter(row=>taskBucket(row)==='completed').length;
      $('task-progress-bar').max=Math.max(1,rows.length);
      $('task-progress-bar').value=passed;
      $('task-progress-label').textContent='正式工作项已验证 '+passed+' / '+rows.length+
        '（'+(rows.length?(passed*100/rows.length).toFixed(1):'0.0')+
        '%）。仅表示工作项 Verified，不代表产品发布 Gate 已通过。';
      if(document.scrollingElement)document.scrollingElement.scrollTop=scroll;
      $('synced').textContent='任务同步于 '+new Date().toLocaleTimeString();
    }catch(error){$('synced').textContent='任务同步失败：'+error.message+'（原数据保留）';}
    finally{taskRefreshInProgress=false;resetRefreshClock();}
  }
  for(const b of document.querySelectorAll(".navbtn"))b.addEventListener("click",()=>go(b.dataset.view));
  for(const b of document.querySelectorAll("[data-go]"))b.addEventListener("click",()=>go(b.dataset.go));
  for(const b of document.querySelectorAll("[data-doc]"))b.addEventListener("click",()=>openDoc(b.dataset.doc));
  for(const b of document.querySelectorAll("[data-tasktab]"))
    b.addEventListener("click",()=>setTaskTab(b.dataset.tasktab));
  $("task-search").addEventListener("input",renderTaskList);
  $("task-stage-filter").addEventListener("change",renderTaskList);
  $("task-type-filter").addEventListener("change",renderTaskList);
  $("open-vision").addEventListener("click",()=>openDoc("docs/product/vision.md"));
  $("open-roadmap").addEventListener("click",()=>openDoc("docs/roadmap/releases.md"));
  $("open-okr").addEventListener("click",()=>openDoc(project?.okr.source||"docs/okr/README.md"));
  $("open-requirements").addEventListener("click",()=>openDoc("docs/product/requirements.md"));
  $("open-architecture").addEventListener("click",()=>openDoc("docs/architecture/overview.md"));
  $("doc-search").addEventListener("input",renderDocs);
  $("history-refresh").addEventListener("click",loadHistory);
  $("history-search").addEventListener("keydown",e=>{if(e.key==="Enter")loadHistory();});
  for(const button of document.querySelectorAll('[data-history-query]'))
    button.addEventListener('click',()=>{
      $('history-search').value=button.dataset.historyQuery;loadHistory();
    });
  $("reload").addEventListener("click",()=>{resetRefreshClock();reload();});
  $('refresh-interval').addEventListener('change',()=>{
    const next=Number($('refresh-interval').value);
    if(!refreshChoices.has(next))return;
    refreshSeconds=next;
    try{localStorage.setItem('devcontrol-refresh-seconds',String(next));}catch{}
    resetRefreshClock();
  });
  $("share-lan").addEventListener("click",showLanAccess);
  $("settings-save").addEventListener("click",saveSettings);
  $("close").addEventListener("click",()=>$("overlay").classList.remove("open"));
  $("overlay").addEventListener("click",e=>{if(e.target===$("overlay"))$("overlay").classList.remove("open");});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")$("overlay").classList.remove("open");});
  localizeChrome();
  router.sync();
  loadBrandVersion();
  reload();updateRefreshCountdown();
  // Visible countdown matches the actual polling schedule. Pause when hidden
  // or when the user is reading a detail drawer, avoiding stale replacements.
  setInterval(()=>{
    const view=router.current();
    if(document.visibilityState!=='visible'||
      $('overlay').classList.contains('open')||
      (view!=='overview'&&view!=='tasks')){updateRefreshCountdown();return;}
    if(reloadInProgress||taskRefreshInProgress){updateRefreshCountdown();return;}
    refreshRemaining=Math.max(0,refreshRemaining-1);
    if(refreshRemaining===0){
      resetRefreshClock();
      if(view==='overview')reload();else refreshTaskData();
    }else updateRefreshCountdown();
  },1000);
  window.addEventListener("focus",()=>{if(document.visibilityState==="visible")reload();});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")reload();});
})();
