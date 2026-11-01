  function taskPlanNodes(){
    const roster=typeof releaseWorkPlan==="undefined"?null:releaseWorkPlan;
    const scope=releasePlan?.status==="review_pending"?
      releasePlan?.proposal:releasePlan?.frozen;
    const releaseNodes=roster && roster.status!=="missing"?
      ((roster.status==="review_pending"||roster.status==="needs_revision"?
        roster.proposal?.plan:roster.frozen?.plan)?.workItems||[]).map(item=>({...item,kind:"leaf",_planOrigin:"release-work",
          release:roster.release,featurePending:roster.status!=="frozen",
          featureNeedsRevision:roster.status==="needs_revision",
          featureReviewIssues:(roster.issues||[]).filter(issue=>
            issue.startsWith(item.id+":")||issue.includes(" "+item.id+" "))})):
      Array.isArray(scope?.nodes)?scope.nodes.map(item=>({...item,_planOrigin:"release"})):[];
    const native=[];
    for(const record of (typeof featureTaskPlans==="undefined"?[]:featureTaskPlans)){
      const source=(record.status==="review_pending"||record.status==="needs_revision"||
        record.status==="awaiting_second_review")?
        record.proposal:record.frozen;
      const previous=new Set((record.frozen?.plan?.nodes||[]).map(item=>item.id));
      if(!Array.isArray(source?.plan?.nodes))continue;
      for(const item of source.plan.nodes)native.push({...item,
        _planOrigin:"feature",featureName:record.featureName,release:source.plan.release,
        featurePending:(record.status==="review_pending"||record.status==="needs_revision"||
          record.status==="awaiting_second_review")&&!previous.has(item.id),
        pendingSecondReview:record.status==="awaiting_second_review",
        featureNeedsRevision:record.status==="needs_revision",featureReviewIssues:record.review?.issues||[]});
    }
    const nativeIds=new Set(native.map(item=>item.id));
    // Feature proposals must stay visible for planning review even when a
    // separate whole-release plan is already frozen in the same project.
    return [...releaseNodes.filter(item=>!nativeIds.has(item.id)),...native];
  }
  let readabilityLoaded=false,readabilityLoading=false;
  let reviewQueueLoaded=false,reviewQueueLoading=false;
  async function loadTaskSpecReviewQueue(){
    if(reviewQueueLoading)return;
    reviewQueueLoading=true;
    $("task-spec-review-count").textContent="读取中…";
    try{
      const queue=await fetchJSON("/api/task-spec-review");
      const items=queue.items||[];
      $("task-spec-review-count").textContent=
        "未开始候选 "+queue.totalCandidates+" 项 · 本批 "+items.length+" 项";
      const host=$("task-spec-review-results");
      host.replaceChildren();
      if(queue.policy!=="review-draft-no-mutation")
        throw Error("评审内容的只读来源无法核实");
      const roster=new Map(taskRows().map(row=>[row.item.id,row]));
      for(const item of items){
        const details=n("details",null,"task-spec-review-item");
        const readiness=item.approvalHold==="scope_amendment"?
          "范围变更待审批":item.approvalHold==="incremental_review"?
          "新增工作待评审":item.readiness==="dependencies_verified"?
          "前置依赖已验证 · 仍需检查范围审批":item.readiness==="dependencies_unknown"?
          "依赖来源待核对":"前置任务尚未全部验证";
        const progress=item.supplement?.status==="awaiting_developer_review"?
          "补充提案已登记 · 待开发者自审（可选独立复审）":
          item.supplement?.status==="awaiting_owner_approval"?
          "补充已复审 · 待 Owner 授权":
          item.supplement?.status==="review_rejected"?
          "补充复审未通过":
          item.supplement?.status==="approved"?
          "补充已批准":"补充尚未登记";
        details.append(n("summary",item.id+" · "+item.title+" · "+progress+" · "+readiness));
        const add=(heading,content)=>{
          if(!content)return;
          const row=n("div",null,"task-spec-review-fact");
          row.append(n("strong",heading),n("p",content));
          details.append(row);
        };
        add("现有冻结验收条件",item.frozenFacts?.acceptance||"未记录");
        add("关联需求",(item.frozenFacts?.requirements||[])
          .map(ref=>ref.id+" "+ref.title).join("；")||"未记录");
        add("冻结来源",[
          item.approval?.planId||"未记录计划ID",
          "修订 "+(item.approval?.revision??"未记录"),
          "审批 Hash "+(item.approval?.planHash||"未记录"),
        ].join(" · "));
        if(item.supplement?.proposalHash)
          add("补充提案 Hash（不同于原冻结审批）",item.supplement.proposalHash);
        if(item.supplement?.reviewHash)
          add("实际审查 Hash（"+(item.supplement.reviewMode==="developer"?
            "开发者自审":"额外独立复审")+"）",item.supplement.reviewHash);
        add("补充审批状态",progress);
        const draft=item.supplement?.draftFields;
        if(draft&&Object.keys(draft).length){
          const names={purpose:"为什么做",scenario:"什么情况下发生",
            workflow:"实施和核对步骤",testCases:"正向测试方案",
            negativeCases:"异常与失败验证",sourceRefs:"核对来源"};
          const container=n("details",null,"task-spec-review-draft");
          container.append(n("summary","查看本次补充草案 · 共 "+
            Object.keys(draft).length+" 类说明（未批准，不进入 AI 正式合同）"));
          for(const field of ["purpose","scenario","workflow",
            "testCases","negativeCases","sourceRefs"]){
            const value=draft[field];
            if(value===undefined)continue;
            const content=Array.isArray(value)?value.map((x,i)=>
              (i+1)+". "+x).join("\n"):String(value);
            const block=n("div",null,"task-spec-review-fact");
            block.append(n("strong",names[field]),n("p",content));
            container.append(block);
          }
          details.append(container);
        }
        add("前置任务",(item.dependencies||[])
          .map(ref=>ref.id+" "+ref.status).join("；")||"无前置依赖");
        add("允许修改文件",(item.frozenFacts?.allowedPaths||[]).join("；")||"未记录");
        add("需要的 Gate",(item.frozenFacts?.gates||[]).join("、")||"未记录");
        add("需要补充或核对的问题",(item.reviewQuestions||[])
          .map((ref,i)=>(i+1)+". "+ref.question).join("\n"));
        add("建议的下一步",item.recommendation);
        const open=n("button","打开任务详情 · 查看正式执行合同","task-spec-review-open");
        open.type="button";
        const destination=roster.get(item.id);
        open.disabled=!destination;
        if(destination)open.addEventListener("click",()=>openPlanTask(destination));
        details.append(open);
        host.append(details);
      }
      if(!items.length)host.append(n("p","当前没有符合范围的未开始任务。"));
      reviewQueueLoaded=true;
    }catch(error){
      $("task-spec-review-count").textContent="暂时无法整理";
      $("task-spec-review-results").replaceChildren(n("p",
        "无法核实本批任务："+error.message));
    }finally{reviewQueueLoading=false;}
  }
  async function loadTaskReadability(){
    if(readabilityLoading)return;
    readabilityLoading=true;
    $("task-readability-count").textContent="检查中…";
    try{
      const data=await fetchJSON("/api/task-readability");
      const counts=data.counts||{};
      $("task-readability-count").textContent=
        (data.total||0)+" 项 · 需补业务说明 "+(counts.needs_explanation||0)+
        " · 待复审合同缺项 "+(counts.needs_contract_review||0)+
        " · 来源缺失 "+(counts.source_missing||0);
      const content=$("task-readability-results");content.replaceChildren();
      const message=n("p","本次检查只评价文字和规格信息完整性，不影响原有任务的已完成或审批状态。","task-detail-muted");
      content.append(message);
      const groups=[
        ["needs_explanation","只需补充业务说明"],
        ["needs_contract_review","执行合同需评估缺项"],
        ["source_missing","原始冻结来源待核对"],
        ["complete","已有较完整说明"],
      ];
      for(const [key,title] of groups){
        const matches=(data.records||[]).filter(record=>record.readability===key);
        if(!matches.length)continue;
        const details=n("details",null,"task-readability-group");
        details.append(n("summary",title+" · "+matches.length+" 项"));
        // Large projects must not render hundreds of offscreen cards.
        for(const record of matches.slice(0,12)){
          const button=n("button",record.id+" · "+record.title,"task-relation-link");
          button.type="button";
          button.addEventListener("click",()=>{
            const row=taskRows().find(entry=>entry.item.id===record.id);
            if(row)openPlanTask(row);
          });
          if(!taskRows().some(entry=>entry.item.id===record.id))button.disabled=true;
          const item=n("div",null,"task-readability-row");
          item.append(button,n("small",(record.missing||[]).length?
            "需核对字段 "+record.missing.join("、"):"现有文字较完整"));
          details.append(item);
        }
        if(matches.length>12)details.append(n("p",
          "仅展示前 12 项。完整结果可通过只读任务完整性 API 查看。","task-detail-muted"));
        content.append(details);
      }
      readabilityLoaded=true;
    }catch(error){
      $("task-readability-count").textContent="暂时无法检查";
      $("task-readability-results").replaceChildren(n("p",
        "读取说明完整性失败："+error.message));
    }finally{readabilityLoading=false;}
  }
  function setupTaskReadability(){
    if($("task-readability-audit").dataset.initialized)return;
    $("task-readability-audit").dataset.initialized="true";
    $("task-readability-audit").addEventListener("toggle",()=>{
      if($("task-readability-audit").open&&!readabilityLoaded)loadTaskReadability();
    });
    $("task-readability-refresh").addEventListener("click",loadTaskReadability);
    $("task-spec-review-queue").addEventListener("toggle",()=>{
      if($("task-spec-review-queue").open&&!reviewQueueLoaded)loadTaskSpecReviewQueue();
    });
    $("task-spec-review-refresh").addEventListener("click",loadTaskSpecReviewQueue);
  }
  function taskRows(){
    const nodes=taskPlanNodes();
    const real=Object.values(board?.columns||{}).flat().filter(t=>t.track==="product");
    const byId=new Map(real.map(t=>[t.id,t]));
    const byParent=new Map();
    nodes.forEach(node=>{
      const p=node.parentId||"";
      if(!byParent.has(p))byParent.set(p,[]);
      byParent.get(p).push(node);
    });
    const result=[],seen=new Set();
    const add=(item,depth=0,stage="")=>{
      if(seen.has(item.id))return;seen.add(item.id);
      const current=byId.get(item.id);
      const phase=item.stageId||stage||item.id;
      const pending=item._planOrigin==="release-work"?item.featurePending:
        item._planOrigin==="feature"?item.featurePending:
        releasePlan?.status==="review_pending"&&!item.existing;
      const status=pending?"pending":current?.status||"unplanned";
      // Planning stages are dependency containers, not user-facing tasks.
      if(item.kind!=="group")result.push({item,current,depth,phase,status,pending});
      (byParent.get(item.id)||[]).forEach(child=>add(child,depth+1,phase));
    };
    (byParent.get("")||[]).forEach(item=>add(item));
    // Do not hide real tasks missing from the proposed plan.
    real.filter(item=>!seen.has(item.id) && item.status!=="cancelled").forEach(item=>{
      result.push({item:{...item,kind:"leaf",dependsOn:item.dependsOn||[],
        requirementIds:item.spec?.requirementIds||[],
        acceptance:item.spec?.acceptance||""},current:item,
        depth:0,phase:item.parentId||item.id,status:item.status,pending:false});
    });
    return result;
  }
  function taskStatus(row){
    const s=row.status;
    if(row.current?.pendingVerification){
      const gate=row.current.pendingVerification.gate;
      return [gate==="dap_grpc_live"?"待 DAP 数据验收":
        gate==="ios_device_e2e"?"待设备验收":"待外部验收",""];
    }
    if(s==="pending")return [row.item.featureNeedsRevision?"规划需修订":
      row.item.pendingSecondReview?"待二次 Review":"规划待确认","pending"];
    if(s==="verified")return ["已完成","done"];
    if(s==="in_progress")return ["开发中",""];
    if(s==="in_review")return ["等待验收",""];
    if(s==="ready"||s==="draft")return ["未开始",""];
    return ["未开始","blocked"];
  }
  function taskBucket(row){
    if(row.status==="cancelled")return null;
    if(row.status==="verified")return "completed";
    if(row.status==="in_progress"||row.status==="in_review")return "in_progress";
    // Not-yet-approved plans must not be counted as in development.
    return "not_started";
  }
  function currentReleaseRows(){
    const rows=taskRows().filter(row=>taskBucket(row)!==null);
    if(releaseWorkPlan?.status!=="frozen")return rows;
    // F0/F1 historical records are still available in SQLite, but a frozen
    // release's progress and task tabs must count only its 403 approved items.
    const frozenIds=new Set((releaseWorkPlan.frozen?.plan?.workItems||[]).map(item=>item.id));
    // Keep pending Feature plans visible without inflating frozen-release
    // progress or allowing their proposed tasks to be claimed.
    return rows.filter(row=>frozenIds.has(row.item.id)||row.pending);
  }
  function displayTaskTitle(task){
    // Historical task IDs/titles in SQLite must remain unchanged.
    const historical={"F0":"基础环境与架构","F1":"最小事件与接口契约"};
    return historical[task.id]||task.title;
  }
  function taskBrief(row){
    const item=row.item,detail=row.current?.spec||{};
    const description=String(item.description||item.scenario||detail.description||detail.scenario||"").trim();
    const acceptance=String(item.acceptance||detail.acceptance||"").trim();
    return {
      description,
      acceptance,
      summary:description?("任务说明："+description):
        (acceptance?("验收目标："+acceptance):"任务规格尚未记录说明及验收目标"),
      requirementIds:item.requirementIds||detail.requirementIds||[],
      paths:item.allowedPaths||row.current?.allowedPaths||[],
      gates:item.requiredGates||row.current?.requiredGates||[],
    };
  }
  function releaseReviewFindings(){
    const plan=releaseWorkPlan?.status==="frozen"?
      releaseWorkPlan.frozen?.plan:releaseWorkPlan?.proposal?.plan;
    // The product review lists its nine accountable workstreams. Closed
    // historical audit notes remain in SQLite but are not a tenth blocker.
    return Array.isArray(plan?.reviewFindings)?
      plan.reviewFindings.filter(f=>f.severity==="blocker"):[];
  }
  function openReviewFinding(issue){
    $("overlay").classList.add("open");
    $("doc-title").textContent=issue.id+" · "+issue.title;
    $("doc-source").textContent="整版评审 · "+
      (issue.decisionStatus==="decided"?"工程方案已定案":"待工程定案")+" · "+
      (issue.verificationStatus==="pending"?"产品验收未通过":"规划问题已处理");
    const content=$("doc-content");content.replaceChildren();
    const box=n("section",null,"spec-block");
    box.append(n("h3","工程方案"),n("p",issue.decision||"技术方案尚未登记"),
      n("h3","下一项具体工作 / 完成标准"),n("p",issue.nextAction||issue.detail),
      n("h3","评审发现"),n("p",issue.detail));
    content.append(box);
    if(issue.affectedIds?.length){
      const links=n("div",null,"review-links");
      for(const id of issue.affectedIds){
        const btn=n("button","查看工作项 "+id);btn.type="button";
        btn.addEventListener("click",()=>{
          const row=taskRows().find(r=>r.item.id===id);
          if(row)openPlanTask(row);
        });
        links.append(btn);
      }
      content.append(links);
    }
  }
  function renderReleaseReview(){
    const findings=releaseReviewFindings();
    const overview=$("overview-release-review"),container=$('requirement-review-list');
    const panel=$('requirement-review-panel');
    overview.replaceChildren();container.replaceChildren();
    panel.classList.toggle('hide',!findings.length);
    overview.classList.toggle('hide',!findings.length);
    $('requirement-review-count').textContent=findings.length+' 项实际评审记录';
    if(!findings.length)return;
    const rows=taskRows();
    const byId=new Map(rows.map(row=>[row.item.id,row]));
    const unresolved=findings.filter(f=>f.verificationStatus!=='passed');
    const summary=n('div');
    summary.append(n('b',unresolved.length+' 项需求或验收事项待落实'),
      n('p','已定案的工程设计不等于已经完成开发；每项须依据真实工作项及产品验收状态确认。'));
    const goToRequirements=n('button','查看需求状态 ↗','btn');
    goToRequirements.type='button';
    goToRequirements.addEventListener('click',()=>go('requirements'));
    overview.append(summary,goToRequirements);
    for(const issue of findings){
      const linked=(issue.affectedIds||[]).map(id=>byId.get(id)).filter(Boolean);
      const unknown=(issue.affectedIds||[]).filter(id=>!byId.has(id));
      const verified=linked.filter(row=>row.current?.status==='verified').length;
      const active=linked.some(row=>['in_progress','in_review'].includes(row.current?.status));
      const state=!linked.length?'未拆分为可追踪任务':
        (verified===linked.length&&issue.verificationStatus==='passed'?'已完成并验收':
         verified===linked.length?'任务已完成 · 待产品验收':
         active?'已拆分 · 开发中':'已拆分 · 待开发');
      const item=n('button',null,'docitem');item.type='button';
      item.append(n('span',issue.id+' · '+state,'taskid'),n('b',issue.title),
        n('small',(issue.decisionStatus==='decided'?'工程方案已定案':'工程方案待定案')+
          ' · 关联 '+linked.length+' 项任务 · Verified '+verified+
          ' · 未找到 '+unknown.length+' 项原始任务'));
      item.addEventListener('click',()=>openReviewFinding(issue));
      container.append(item);
    }
  }
  function setTaskTab(tab){
    if(!["not_started","in_progress","completed"].includes(tab))return;
    taskTab=tab;
    for(const b of document.querySelectorAll("[data-tasktab]"))
      b.setAttribute("aria-selected",String(b.dataset.tasktab===tab));
    renderTaskList();
  }
  // One detail renderer for frozen Feature and release-work tasks. Only the
  // server knows the authoritative plan snapshot and its approved revision.
  function openPlanTask(row){
    $("overlay").classList.add("open");
    $("overlay").classList.add("task-detail-view");
    const item=row.item,actual=row.current,status=taskStatus(row)[0];
    $("doc-title").textContent=item.id+" · "+displayTaskTitle(item);
    $("doc-source").textContent=(row.pending?"规划预览 · 尚未批准":"SQLite 任务台账")+
      " · "+String(item.release||actual?.release||"")+" · "+status;
    const body=$("doc-content");body.replaceChildren();
    const content=n("div",null,"issue-details");body.append(content);
    const section=(host,heading,value)=>{
      const block=n("section");block.append(n("h3",heading));
      const values=Array.isArray(value)?value:[value];
      if(!values.length||values.every(v=>v===null||v===undefined||v==="")){
        block.append(n("p","未记录"));
      }else for(const entry of values){
        if(entry===null||entry===undefined||entry==="")continue;
        block.append(n("p",Array.isArray(value)?"• "+String(entry):String(entry)));
      }
      host.append(block);
      return block;
    };
    const tabs=n("div",null,"task-detail-tabs");
    tabs.setAttribute("role","tablist");
    tabs.setAttribute("aria-label","任务阅读方式");
    const overviewTab=n("button","任务概览"),contractTab=n("button","执行合同");
    overviewTab.type=contractTab.type="button";
    overviewTab.id="task-detail-tab-overview";
    contractTab.id="task-detail-tab-contract";
    const overviewHost=n("div",null,"task-overview-details");
    const taskHost=n("div",null,"task-contract-details");
    const relationsHost=n("div",null,"task-relations-details");
    const relationJump=n("button","查看任务关联","task-detail-jump");
    relationJump.type="button";
    relationJump.addEventListener("click",()=>relationsHost.scrollIntoView({block:"nearest",behavior:"smooth"}));
    const evidenceHost=n("div",null,"task-delivery-details");
    overviewHost.id="task-detail-overview";
    taskHost.id="task-detail-contract";
    overviewHost.setAttribute("role","tabpanel");
    taskHost.setAttribute("role","tabpanel");
    overviewHost.setAttribute("aria-labelledby",overviewTab.id);
    taskHost.setAttribute("aria-labelledby",contractTab.id);
    const activateTab=tab=>{
      const overview=tab==="overview";
      overviewHost.hidden=!overview;taskHost.hidden=overview;
      for(const [button,selected,panel] of [[overviewTab,overview,overviewHost],
        [contractTab,!overview,taskHost]]){
        button.setAttribute("role","tab");
        button.setAttribute("aria-selected",String(selected));
        button.setAttribute("aria-controls",panel.id);
        button.tabIndex=selected?0:-1;
      }
    };
    overviewTab.addEventListener("click",()=>activateTab("overview"));
    contractTab.addEventListener("click",()=>activateTab("contract"));
    tabs.addEventListener("keydown",event=>{
      if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
      if(![overviewTab,contractTab].includes(document.activeElement))return;
      event.preventDefault();
      const target=event.key==="Home"?overviewTab:event.key==="End"?contractTab:
        document.activeElement===overviewTab?contractTab:overviewTab;
      target.click();target.focus();
    });
    tabs.append(overviewTab,contractTab,relationJump);
    content.append(tabs,overviewHost,taskHost,relationsHost);
    const contractSections=n("div",null,"task-contract-sections");
    taskHost.append(contractSections,evidenceHost);
    activateTab("overview");
    // Relationships are shared by both views, never another version of the
    // contract. Only link IDs already present in the authoritative task roster.
    const roster=taskRows(),known=new Map(roster.map(entry=>[entry.item.id,entry]));
    const link=(id,role)=>{
      const destination=known.get(id);
      const label=destination?displayTaskTitle(destination.item):"未在当前任务清单找到";
      const button=n("button",id+" · "+label,"task-relation-link");
      button.type="button";
      button.disabled=!destination;
      if(destination)button.addEventListener("click",()=>openPlanTask(destination));
      const wrap=n("div",null,"task-relation-row");
      wrap.append(n("small",role),button);
      return wrap;
    };
    function renderRelationships(contract){
      relationsHost.replaceChildren(n("h3","任务关联"));
      const parent=contract?.parentId||item.parentId||actual?.parentId;
      if(parent)relationsHost.append(link(parent,"所属任务"));
      const dependencies=contract?.dependsOn||item.dependsOn||actual?.dependsOn||[];
      for(const id of Array.isArray(dependencies)?dependencies:[])
        relationsHost.append(link(id,"前置依赖"));
      const children=roster.filter(entry=>(entry.item.parentId||entry.current?.parentId)===item.id);
      for(const child of children)relationsHost.append(link(child.item.id,"子任务"));
      const downstream=roster.filter(entry=>
        (entry.item.dependsOn||entry.current?.dependsOn||[]).includes(item.id));
      for(const child of downstream)relationsHost.append(link(child.item.id,"后续依赖"));
      if(!parent&&!(Array.isArray(dependencies)&&dependencies.length)&&
        !children.length&&!downstream.length)
        relationsHost.append(n("p","当前没有已记录的直接任务关系。","task-detail-muted"));
      const requirements=contract?.requirementIds||item.requirementIds||[];
      if(Array.isArray(requirements)&&requirements.length)
        relationsHost.append(n("p","关联需求 "+requirements.join("、"),"task-detail-muted"));
    }
    function renderOverview(contract,completion,readability){
      overviewHost.replaceChildren();
      const usable=contract&&contract.authoritative===true;
      const preview=contract&&!usable;
      const hero=n("section",null,"task-overview-hero");
      hero.append(n("small",row.pending?"规划未批准 · 不可执行":
        usable?"已关联正式冻结任务合同":"未找到可核实的冻结合同"),
        n("h3",status+" · "+(item.release||actual?.release||"当前版本")));
      if(preview)hero.append(n("p","以下为规划或台账摘要，不是已经批准的 AI 执行合同。"));
      overviewHost.append(hero);
      const text=value=>Array.isArray(value)?value.filter(Boolean).join("；"):String(value||"").trim();
      const purpose=usable?text(contract.purpose||contract.description):
        row.pending?text(item.purpose||item.description||item.scenario):
        preview?text(contract.purpose||contract.description||contract.scenario):"";
      const scope=usable?text(contract.acceptance):
        row.pending?text(item.acceptance):preview?text(contract.acceptance):"";
      const requirements=Array.isArray(contract?.requirementIds)?
        contract.requirementIds:[];
      const why=readability?.purpose;
      const whyContent=why?.source==="frozen-task"?why.text:
        why?.source==="approved-supplement"?
          [why.text,"以上为通过独立审核及 Owner 授权的任务补充说明，不覆盖原冻结合同。"]:
        why?.source==="requirement-reference"?
          [why.text,"以上来自关联产品需求，并非独立批准的任务目的说明。"]:
        purpose||(requirements.length?"未单独记录业务背景；关联需求 "+requirements.join("、"):
          "原始规格未单独记录背景，需核对需求来源。");
      section(overviewHost,"为什么做",whyContent);
      const outcomes=readability?.outcomes;
      section(overviewHost,"本次要完成什么",
        outcomes?.length?outcomes:scope||"未记录明确验收目标，不根据标题猜测任务内容。");
      if(readability?.requirementRefs?.length)
        section(overviewHost,"对应的产品需求",readability.requirementRefs.map(ref=>
          ref.id+" · "+ref.title));
      if(completion){
        section(overviewHost,"已经完成的工作",[completion.summary,completion.implementation]);
      }else section(overviewHost,"当前进展",row.pending?"规划待审批，尚未进入研发。":
        actual?.status==="verified"?"台账显示 Verified，具体交付与证据请查看执行记录。":
        actual?.status==="in_review"?"已进入验收阶段，不代表正式 Gate 已通过。":
        actual?.status==="in_progress"?"正在开发，尚未登记正式完成报告。":
        "尚未开始执行；任务状态以 SQLite 为准。");
      const pending=actual?.pendingVerification;
      section(overviewHost,"当前阻塞与下一步",pending?
        ["待验证 Gate "+pending.gate,"原因："+pending.reason,
          "下一步：执行真实验收并登记对应证据。"]:
        row.pending?"下一步：完成规划审核，批准前不能领取任务。":
        actual?.status==="verified"?"已正式验证；无待处理 Gate 信息。":
        actual?.status==="in_review"?"下一步：核对真实测试证据及未通过的 Gate。":
        actual?.status==="in_progress"?"下一步：按冻结合同继续实施并登记真实测试结果。":
        "下一步：检查依赖和审批状态，符合条件后领取任务。");
      if(usable)section(overviewHost,"怎样算完成",
        contract.acceptance||"合同未记录独立验收标准。");
      if(readability){
        const label={
          complete:"说明与执行依据较完整",
          needs_explanation:"执行依据已有，业务背景需要补充",
          needs_contract_review:"部分正式执行或测试要求尚未写明",
          source_missing:"未找到原始冻结合同",
        }[readability.status]||"尚未评估";
        section(overviewHost,"任务说明完整性",[
          label,
          ...(readability.issues?.length?[
            "建议核对："+readability.issues.map(issue=>issue.label).join("、")]:[]),
          readability.nextAction,
          "这是只读提示，不改变任务批准、Verified 或 Gate 状态。",
        ]);
      }
      const action=n("button","查看完整执行合同和验收记录","task-overview-action");
      action.type="button";action.addEventListener("click",()=>{
        activateTab("contract");tabs.scrollIntoView({block:"nearest"});
      });
      overviewHost.append(action);
    }
    renderRelationships(null);
    renderOverview(null,null);
    function renderTaskContract(contract){
      contractSections.replaceChildren();
      if(!contract){
        section(contractSections,"任务合同","正在读取原始冻结合同，不根据标题推断实施内容。");
        return;
      }
      contractSections.append(n("p","以下为正式任务规格的只读分组展示。展开原始合同可核对 MCP 实际返回的数据。","task-detail-muted"));
      const group=(title,entries,opened=true)=>{
        const disclosure=n("details",null,"task-contract-group");
        disclosure.open=opened;
        disclosure.append(n("summary",title));
        for(const [heading,value] of entries)section(disclosure,heading,value);
        contractSections.append(disclosure);
      };
      const source=contract.source;
      if(source){
        group("基本信息与冻结版本",[["冻结合同版本",[
          "来源："+(source.kind||"未知"),
          "计划："+(source.planId||"未记录"),
          "审批修订："+(source.revision??"未记录"),
          "审批 Hash："+(source.planHash||"未记录"),
          "批准者："+(source.approvedBy||"未记录"),
          "冻结状态："+(contract.authoritative?"已定位原始冻结节点":"缺失权威冻结节点"),
        ]]],true);
      }else group("规划预览",[["来源","以下内容尚未冻结，不构成可执行任务合同。"]],true);
      group("需求与设计",[
        ["任务说明",contract.purpose||contract.description],
        ["使用场景 / 触发条件",contract.scenario],
        ["对应需求",contract.requirementIds],
        ["技术方案与约束",contract.designRef],
        ["原始需求及设计参考",contract.sourceRefs],
        ["业务规则与不可变约束",contract.businessRules],
      ]);
      group("执行范围和依赖",[
        ["文件修改范围",contract.allowedPaths],
        ["精确文件白名单",contract.allowedChangedFiles],
        ["前置依赖",contract.dependsOn],
        ["不在本任务范围",contract.outOfScope],
      ]);
      group("实施步骤与输入输出",[
        ["已批准的执行步骤",contract.workflow],
        ["输入与前置条件",contract.inputs],
        ["交付输出",contract.outputs],
        ["前置检查",contract.preconditions],
        ["状态变化",contract.stateTransitions],
        ["具体交付物",contract.deliverables],
        ["预计工作量",contract.estimatedHours],
      ]);
      group("验收标准与测试",[
        ["必须完成什么 · 验收目标",contract.acceptance],
        ["正向测试场景",contract.testCases],
        ["异常 / 边界测试",contract.negativeCases],
        ["交付与验收证据要求",contract.verificationEvidence],
        ["必须通过的质量门禁",contract.requiredGates],
      ]);
      group("执行约束与停止条件",[
        ["停止条件",contract.stopConditions],
        ["禁止变更",contract.forbiddenChanges],
        ["任务归属角色",contract.ownerRole],
        ["任务类型",contract.type||contract.kind],
        ["平台",contract.platform],
        ["任务粒度说明",contract.granularityJustification],
      ],false);
      const audit=contract.audit;
      if(audit&&Array.isArray(audit.missing))
        section(contractSections,"任务规格完整性检查",audit.passed?
          "详细任务规格已完成检查；真实交付与验收仍须独立审核。":
          ["当前任务按所属工作类型缺少 "+audit.missing.length+
            " 项关键说明："+audit.missing.join("、"),
            "此为只读审核，不改变既有审批和 Verified 状态。",
            ...(audit.issues||[])]);
      if(!source&&!contract.workflow?.length)
        section(contractSections,"实施步骤的规格状态","尚未冻结具体流程，不得从任务标题推断。");
    }
    function renderRawContract(execution,contract){
      const raw=n("details",null,"task-contract-raw");
      raw.append(n("summary","查看原始合同 · MCP execution-contract"));
      raw.append(n("p","下方 JSON 与执行时 MCP 的 execution-contract 数据结构一致。冻结来源单独展示，不根据摘要补齐缺失字段。","task-detail-muted"));
      raw.append(n("pre",execution?JSON.stringify(execution,null,2):
        "未取得正式 execution-contract，不能用界面摘要替代。"));
      contractSections.append(raw);
      const frozen=n("details",null,"task-contract-raw");
      frozen.append(n("summary","查看原始冻结任务规格及版本"));
      frozen.append(n("pre",contract?JSON.stringify(contract,null,2):
        "未找到原始冻结任务规格。"));
      contractSections.append(frozen);
    }
    section(evidenceHost,"当前状态与执行边界",row.pending?
      "规划尚未批准，不能领取、开发或计入 Verified。":
      "状态："+status+"；最终以 SQLite 状态、依赖和 Gate 审核记录为准。");
    if(row.current?.pendingVerification)section(evidenceHost,"待验证 — 未通过正式 Gate",[
      "Gate："+row.current.pendingVerification.gate,
      "延期原因："+row.current.pendingVerification.reason,
      "冻结提交："+row.current.pendingVerification.completionHead,
    ]);
    if(row.pending){
      const proposal={...item,dependsOn:item.dependsOn||[],
        source:null,authoritative:false};
      renderTaskContract(proposal);
      renderOverview(proposal,null);
      renderRelationships(proposal);
      renderRawContract(null,null);
      return;
    }
    section(evidenceHost,"负责人 / 开发电脑",[
      "负责人："+(actual?.owner||item.owner||"未记录"),
      "开发电脑："+(actual?.ownerAssignment?.device||"未记录"),
    ]);
    const completionBox=section(evidenceHost,"执行和完成说明","正在读取真实交付记录…");
    const evidenceBox=section(evidenceHost,"提交及审计证据","正在读取验收证据…");
    renderTaskContract(null);
    fetchJSON("/api/tasks/"+encodeURIComponent(actual?.id||item.id)).then(data=>{
      if(!content.isConnected)return;
      // Compatibility with old read-only API fixtures: show the summary but
      // never claim it is a frozen full contract when provenance is absent.
      const safeSummary=data.contract??(data.task?{
        ...data.task.spec,allowedPaths:data.task.allowedPaths,
        requiredGates:data.task.requiredGates,dependsOn:data.task.dependsOn,
        source:null,authoritative:false,audit:data.detailAudit,
      }:(data.detailAudit?{source:null,authoritative:false,audit:data.detailAudit}:null));
      renderTaskContract(safeSummary);
      const fill=(target,title,values)=>{
        target.replaceChildren(n("h3",title),...values.map(value=>n("p",value)));
      };
      const note=data.completion;
      renderOverview(safeSummary,note,data.readability);
      renderRelationships(safeSummary);
      renderRawContract(data.executionContract,data.contract);
      if(data.supplement?.approved){
        const addendum=data.supplement.approved;
        section(contractSections,"已批准的任务附加规格（原冻结合同不变）",[
          "版本："+addendum.revision,
          "补充提案 Hash："+addendum.proposalHash,
          "独立审核 Hash："+addendum.reviewHash,
          "补充内容："+JSON.stringify(addendum.proposal?.fields??{},null,2),
        ]);
      }
      if(data.supplement?.pending){
        section(contractSections,"待审核的任务补充（不生效）",[
          "提案 Hash："+data.supplement.pending.proposalHash,
          "当前状态："+(data.supplement.pending.review?.outcome||"待独立审核"),
          "该补充尚未获得 Owner 授权，不能作为 AI 执行要求。",
        ]);
      }
      fill(completionBox,"执行和完成说明",note?[
        "完成总结："+note.summary,"实际交付："+note.implementation,
        "验证结果："+note.verification,"遗留工作："+(note.remaining||"无"),
        "交付 Git HEAD："+(note.git_head||"未记录"),
        "完成记录版本："+(note.revision??"未记录"),
      ]:["尚无完成记录；不能将开发进度视为 Verified。"]);
      fill(evidenceBox,"提交及审计证据",(data.evidence||[]).length?
        data.evidence.map(v=>v.kind+" · "+v.reference+" · Git "+(v.git_head||"未记录")):
        ["尚无正式验收证据记录。"]);
      section(evidenceHost,"审计事件（最近记录）",
        (data.audit||[]).slice(-15).map(v=>
          [v.created_at,v.event,v.actor].filter(Boolean).join(" · ")));
      if(data.decision)section(evidenceHost,"工程决策详情",[
        "决策状态："+data.decision.status,
        "具体决定："+data.decision.decision,
        "依据与取舍："+data.decision.rationale,
        "后续验证："+data.decision.verificationPlan,
      ]);
    }).catch(error=>{
      if(!content.isConnected)return;
      renderTaskContract(null);
      renderOverview(null,null);
      completionBox.replaceChildren(n("h3","任务合同读取失败"),
        n("p","无法读取冻结合同："+error.message));
    });
  }
  // Shared task card for whole-release and Feature planning alike.
  // The prior Feature fallback rendered dark .simple-task cards inside v5 light UI.
  function renderTaskCard(row){
        const item=row.item,button=n("button",null,"task-card");button.type="button";
        const brief=taskBrief(row);
        const [status,state]=taskStatus(row);
        const actualOwner=row.current?.owner||item.owner;
        const actualDevice=row.current?.ownerAssignment?.device;
        const heading=n("span",null,"task-card-heading");
        heading.append(n("small",item.id+" · "+(item.stageId||row.phase||"当前阶段"),"task-card-id"),
          n("strong",displayTaskTitle(item),"task-card-title"));
        const leading=n("span",null,"task-card-leading");
        leading.append(heading,n("span",brief.description||brief.acceptance||
          "尚无详细任务说明，请打开任务合同核对。","task-card-description"));
        const chips=n("span",null,"task-card-chips");
        chips.append(n("span",status,"issue-state "+state));
        chips.append(n("span",(item.type||"工作项")+" · "+(item.platform||"—"),"task-card-type"));
        const owner=n("span",null,"task-card-owner");
        const ownerDisplay=actualOwner?(actualOwner+(actualDevice?" · "+actualDevice:"")):
          ("未领取 · "+(item.ownerRole||"待分配"));
        const ownerValue=n("span",ownerDisplay,"task-card-owner-value");
        ownerValue.title=ownerDisplay;
        owner.append(n("small",actualOwner?"负责人":"责任角色","task-card-label"),ownerValue);
        const supporting=n("span",null,"task-card-support");
        supporting.append(n("span",[
          brief.requirementIds.length?"需求 "+brief.requirementIds.join("、"):"待关联需求",
          brief.gates.length?"Gate "+brief.gates.join("、"):"待记录 Gate",
        ].join(" · "),"task-card-contract"));
        const note=row.pending?
          (item.pendingSecondReview?
            "规划已保存，需下一轮独立审阅操作；同一 Agent 可复审":
            "规划尚未确认，需按当前审核证据确认；此前不可领取"):
          row.current?.pendingVerification?
          ("待验证："+row.current.pendingVerification.gate+" · "+
            row.current.pendingVerification.reason):
          (item.blockingReason||item.remark||"");
        if(note)supporting.append(n("span",note,"task-card-note"));
        const side=n("span",null,"task-card-side");
        side.append(chips,owner,n("span","查看详情","task-card-detail"));
        button.append(leading,side,supporting);
        button.setAttribute("aria-label",item.id+" "+displayTaskTitle(item)+"，"+status+"，查看任务详情");
        button.addEventListener("click",()=>openPlanTask(row));
        return button;
  }
  function renderTaskList(){
    setupTaskReadability();
    const rows=currentReleaseRows();
    for(const [name,key,choices] of [
      ["task-stage-filter","stageId",[...new Set(rows.map(r=>r.item.stageId||r.phase).filter(Boolean))].sort()],
      ["task-type-filter","type",[...new Set(rows.map(r=>r.item.type).filter(Boolean))].sort()],
    ]){
      const select=$(name),selected=select.value;
      select.replaceChildren(n("option",key==="stageId"?"全部阶段":"全部类型"));
      select.firstChild.value="";
      for(const choice of choices){
        const option=n("option",choice);option.value=choice;select.append(option);
      }
      if(choices.includes(selected))select.value=selected;
    }
    for(const bucket of ["not_started","in_progress","completed"]){
      $("count-"+bucket).textContent=String(rows.filter(row=>taskBucket(row)===bucket).length);
    }
    const search=$("task-search").value.trim().toLowerCase();
    const filtered=rows.filter(row=>{
      if(taskBucket(row)!==taskTab)return false;
      const data=row.item;
      if($("task-stage-filter").value&&(data.stageId||row.phase)!==$(
        "task-stage-filter").value)return false;
      if($("task-type-filter").value&&data.type!==$("task-type-filter").value)return false;
      return !search||[data.id,displayTaskTitle(data),data.scenario,data.acceptance,(data.requirementIds||[]).join(" "),
        data.platform,data.owner,data.remark,data.blockingReason,
        (data.negativeCases||[]).join(" "),(data.deliverables||[]).join(" ")].join(" ").toLowerCase().includes(search);
    });
    if((typeof releaseWorkPlan!=="undefined")&&releaseWorkPlan&&
      releaseWorkPlan.status!=="missing"){
      // One readable, responsive task surface across desktop and mobile.
      // Keep every task's approved identity, state, evidence and detail action.
      const shell=n("div",null,"task-collection");
      for(const row of filtered)shell.append(renderTaskCard(row));
      $("task-rows").replaceChildren(filtered.length?shell:n("div","当前筛选无工作项。","docs-empty"));
      $("task-list-count").textContent="当前版本 "+releaseWorkPlan.release+" · "+
        filtered.length+" 项独立工作 · "+(releaseWorkPlan.status==="needs_revision"?
        "整版规划待完善":releaseWorkPlan.status==="review_pending"?
        "整版待确认":releaseWorkPlan.status==="frozen"?"整版已冻结":"尚未规划");
      return;
    }
    const phases=new Map(),groups=new Map(taskPlanNodes().filter(x=>x.kind==="group").map(x=>[x.id,x]));
    for(const row of filtered){
      const phase=row.phase||"其它任务";
      if(!phases.has(phase))phases.set(phase,[]);
      phases.get(phase).push(row);
    }
    $("task-rows").replaceChildren(...(filtered.length?[...phases].map(([phase,items])=>{
      const container=n("section",null,"task-phase");
      const head=n("div",null,"task-phase-head");
      head.append(n("strong",phase+" · "+(groups.get(phase)?.title||"独立任务")),
        n("small",items.length+" 项 · "+items.filter(x=>x.pending).length+" 项待规划确认"));
      const list=n("div",null,"task-collection");
      for(const row of items)list.append(renderTaskCard(row));
      container.append(head,list);return container;
    }):[n("div",search?"没有匹配的任务。":"当前没有任务。","docs-empty")]));
    const pending=rows.filter(row=>row.pending&&taskBucket(row)===taskTab).length;
    $("task-list-count").textContent=locale==="en"?
      ("Showing "+filtered.length+" tasks"+(pending?" · "+pending+" awaiting plan confirmation (not executable)":"")):
      ("显示 "+filtered.length+" 项"+(pending?" · "+pending+" 项待规划确认（尚不可领取）":""));
  }
