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
    const taskHost=n("div",null,"task-contract-details");content.append(taskHost);
    const evidenceHost=n("div",null,"task-delivery-details");content.append(evidenceHost);
    function renderTaskContract(contract){
      taskHost.replaceChildren();
      if(!contract){
        section(taskHost,"任务合同","未找到冻结合同，不能依据任务标题推断实施内容。");
        return;
      }
      const source=contract.source;
      if(source){
        section(taskHost,"冻结合同版本",[
          "来源："+(source.kind||"未知"),
          "计划："+(source.planId||"未记录"),
          "审批修订："+(source.revision??"未记录"),
          "审批 Hash："+(source.planHash||"未记录"),
          "批准者："+(source.approvedBy||"未记录"),
          "冻结状态："+(contract.authoritative?"已定位原始冻结节点":"缺失权威冻结节点"),
        ]);
      }else section(taskHost,"规划预览","以下内容尚未冻结，不构成可执行任务合同。");
      const pairs=[
        ["任务说明",contract.purpose||contract.description],
        ["使用场景 / 触发条件",contract.scenario],
        ["必须完成什么 · 验收目标",contract.acceptance],
        ["对应需求",contract.requirementIds],
        ["已批准的执行步骤",contract.workflow],
        ["输入与前置条件",contract.inputs],
        ["交付输出",contract.outputs],
        ["业务规则与不可变约束",contract.businessRules],
        ["正向测试场景",contract.testCases],
        ["异常 / 边界测试",contract.negativeCases],
        ["交付与验收证据要求",contract.verificationEvidence],
        ["文件修改范围",contract.allowedPaths],
        ["精确文件白名单",contract.allowedChangedFiles],
        ["必须通过的质量门禁",contract.requiredGates],
        ["前置依赖",contract.dependsOn],
        ["技术方案与约束",contract.designRef],
        ["原始需求及设计参考",contract.sourceRefs],
        ["不在本任务范围",contract.outOfScope],
        ["停止条件",contract.stopConditions],
        ["禁止变更",contract.forbiddenChanges],
      ];
      for(const [heading,value] of pairs) section(taskHost,heading,value);
      const audit=contract.audit;
      if(audit&&Array.isArray(audit.missing))
        section(taskHost,"任务规格完整性检查",audit.passed?
          "详细任务规格已完成检查；真实交付与验收仍须独立审核。":
          ["当前任务按所属工作类型缺少 "+audit.missing.length+
            " 项关键说明："+audit.missing.join("、"),
            "此为只读审核，不改变既有审批和 Verified 状态。",
            ...(audit.issues||[])]);
      if(!source&&!contract.workflow?.length)
        section(taskHost,"实施步骤的规格状态","尚未冻结具体流程，不得从任务标题推断。");
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
      renderTaskContract({...item,dependsOn:item.dependsOn||[],source:null});
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
      fill(completionBox,"执行和完成说明",note?[
        "完成总结："+note.summary,"实际交付："+note.implementation,
        "验证结果："+note.verification,"遗留工作："+(note.remaining||"无"),
      ]:["尚无完成记录；不能将开发进度视为 Verified。"]);
      fill(evidenceBox,"提交及审计证据",(data.evidence||[]).length?
        data.evidence.map(v=>v.kind+" · "+v.reference):
        ["尚无正式验收证据记录。"]);
      if(data.decision)section(evidenceHost,"工程决策详情",[
        "决策状态："+data.decision.status,
        "具体决定："+data.decision.decision,
        "依据与取舍："+data.decision.rationale,
        "后续验证："+data.decision.verificationPlan,
      ]);
    }).catch(error=>{
      if(!content.isConnected)return;
      renderTaskContract(null);
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
