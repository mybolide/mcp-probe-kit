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
      const reason=gate==="dap_grpc_live"?"待 DAP 数据验收":
        gate==="ios_device_e2e"?"待设备验收":"待外部验收";
      return [reason,""];
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
  function openPlanTask(row){
    $("overlay").classList.add("open");
    const task=row.item,actual=row.current,status=taskStatus(row)[0];
    $("doc-title").textContent=task.id+" · "+displayTaskTitle(task);
    const releaseName=String(task.release||actual?.release||releasePlan?.release||"");
    $("doc-source").textContent=(row.pending?
      (locale==="en"?"SQLite proposal pending approval · cannot execute":"SQLite 待审提案，未批准执行"):
      (locale==="en"?"Approved task ledger":"已存在任务台账"));
    $("doc-source").textContent=releaseName+(task.featureName?" · Feature "+task.featureName:"")+" · "+$("doc-source").textContent+" · "+translate(status);
    const body=$("doc-content");body.replaceChildren();
    const content=n("div",null,"issue-details");body.append(content);
    const section=(heading,value)=>{
      const box=n("section");
      box.append(n("h3",heading));
      if(Array.isArray(value)){
        if(value.length)for(const v of value)box.append(n("p","• "+String(v)));
        else box.append(n("p","未明确"));
      }else box.append(n("p",value===null||value===undefined||value===""?"未明确":String(value)));
      content.append(box);return box;
    };
    const showDelivery=()=>{
      if(!actual||row.pending)return;
      const completionBox=section("执行和完成说明","正在读取真实交付记录…");
      const evidenceBox=section("提交及审计证据","正在读取验收证据…");
      const fill=(box,heading,lines)=>{
        box.replaceChildren(n("h3",heading),...lines.map(line=>n("p",line)));
      };
      fetchJSON("/api/tasks/"+encodeURIComponent(actual.id)).then(data=>{
        // An old request must not overwrite a newer task's details.
        if(!content.isConnected)return;
        const note=data.completion;
        fill(completionBox,"执行和完成说明",note?[
          "完成总结："+note.summary,
          "实际交付："+note.implementation,
          "验证结果："+note.verification,
          "遗留工作："+(note.remaining||"无"),
        ]:["尚无经提交的完整交付说明；任务未验收时不得显示为已完成。"]);
        fill(evidenceBox,"提交及审计证据",(data.evidence||[]).length?
          data.evidence.map(v=>v.kind+" · "+v.reference):["尚无正式提交的验收证据"]);
        if(data.decision){
          section("工程决策详情",[
            "决策状态："+data.decision.status+"（不代表产品 G2 已批准）",
            "具体决定："+data.decision.decision,
            "依据与取舍："+data.decision.rationale,
            "后续验证："+data.decision.verificationPlan,
          ]);
        }
        if(data.detailAudit?.audit!==null&&Array.isArray(data.detailAudit?.missing)){
          const labels={purpose:"背景与目的",scenario:"触发场景",inputs:"输入与前置条件",
            outputs:"交付输出",workflow:"执行步骤",businessRules:"业务及系统约束",
            negativeCases:"失败与边界场景",testCases:"验证用例",
            verificationEvidence:"交付与验收证据",outOfScope:"不在本任务范围",
            sourceRefs:"原始需求及设计来源"};
          const missing=data.detailAudit.missing.map(key=>labels[key]||key);
          section("任务规格完整性检查",data.detailAudit.passed?
            "详细任务说明已覆盖全部检查项。验收仍需真实执行证据。":
            ["当前任务按所属工作类型缺少 "+missing.length+" 项关键说明："+missing.join("、"),
              "这是原始规划资料的缺口，不改变历史 Verified、已批准范围或任务领取权限；需正式评审后补充。",
              ...(data.detailAudit.issues||[])]);
          if(data.detailAudit.suggested?.length)section("可按需要补充的内容",
            data.detailAudit.suggested.map(key=>labels[key]||key)
              .concat(["不适用于该类任务时可留空，不必为填满字段编造内容。"]));
        }
      }).catch(e=>{
        if(!content.isConnected)return;
        fill(completionBox,"执行和完成说明",["读取失败："+e.message]);
        fill(evidenceBox,"提交及审计证据",["请重新同步后再打开任务详情"]);
      });
    };
    if(task._planOrigin==="release-work"){
      const brief=taskBrief(row);
      section("任务说明",task.purpose||brief.description||
        "冻结任务未单独记录实施说明。目前只明确了下方验收目标，不能将标题当成详细设计；执行前须核对需求、工程设计和任务范围。");
      if(task.purpose&&brief.description)section("触发场景与用户期望",brief.description);
      section("必须完成什么 · 验收目标",brief.acceptance||"冻结任务尚未记录可验收目标，须先补充并评审。");
      section("对应需求",brief.requirementIds.length?brief.requirementIds:
        ["该工作项尚未记录需求编号，应按正式评审补齐。"]);
      if(task.workflow?.length)section("已批准的执行步骤",task.workflow);
      else if(!brief.description)section("实施步骤的规格状态",
        "冻结工作项未提供独立的执行步骤。本页面不推测实现方式；领取前应核对技术方案，缺少必要规格时先履行变更评审。");
      if(task.inputs?.length)section("输入与前置条件",task.inputs);
      if(task.outputs?.length)section("交付输出",task.outputs);
      if(task.businessRules?.length)section("业务与系统约束",task.businessRules);
      if(task.negativeCases?.length)section("失败与边界场景",task.negativeCases);
      if(task.testCases?.length)section("验证场景",task.testCases);
      if(task.verificationEvidence?.length)section("交付与验收证据要求",task.verificationEvidence);
      if(task.outOfScope?.length)section("不在本任务范围",task.outOfScope);
      if(task.sourceRefs?.length)section("需求与设计参考",task.sourceRefs);
      section("文件修改范围",brief.paths.length?brief.paths:
        ["未记录允许文件范围；领取开发任务前必须核验合同。"]);
      section("必须通过的质量门禁",brief.gates.length?brief.gates:
        ["未记录测试 Gate；须以实时 execution-contract 为准。"]);
      section("工作项信息",[
        "状态："+status,"类型："+(task.type||"—"),
        "责任角色："+(task.ownerRole||"尚未分工"),
        "平台："+(task.platform||"—"),"所属阶段："+(task.stageId||"—"),
        "关联功能："+(task.featureName||"版本公共任务"),
      ]);
      if(actual?.pendingVerification)section("待验证 — 未通过正式 Gate",[
        "待验收 Gate："+actual.pendingVerification.gate,
        "暂缓原因："+actual.pendingVerification.reason,
        "原代码提交："+actual.pendingVerification.completionHead,
        "登记时间："+actual.pendingVerification.deferredAt,
        "该任务没有 Verified，也不阻塞其它独立任务领取。",
      ]);
      const execution=actual?.owner||actual?.ownerAssignment?.device;
      if(execution)section("实际执行信息",[
        ...(actual?.owner?["负责人："+actual.owner]:[]),
        ...(actual?.ownerAssignment?.device?["开发电脑："+actual.ownerAssignment.device]:[]),
        ...(actual?.verifiedAt?["验证完成："+actual.verifiedAt]:[]),
      ]);
      if(task.checklist?.length)section("完成检查",task.checklist);
      if(task.remark)section("备注",task.remark);
      if(task.blockingReason)section("阻塞原因",task.blockingReason);
      section("前置依赖",task.dependsOn||[]);
      if(task.featureReviewIssues?.length)section("整版评审未通过",task.featureReviewIssues);
      if(row.pending)section("开发限制","当前版本计划尚未确认，普通子任务无需逐项找 Owner 审批。开发 Agent 应先检查计划再按范围确认；此前不可领取。");
      showDelivery();
      return;
    }
    section("当前状态与执行边界",row.pending?
      (task.featureNeedsRevision?"规划仍有缺口，需完善 · ":"规划待 Agent 确认 · ")+"不可领取、执行或计入版本完成率。":
      "状态："+status+"。执行以真实 SQLite 状态、依赖和 Gate 为准。");
    if(task.featureReviewIssues?.length)section("DevControl 规划检查：待修正问题",task.featureReviewIssues);
    const brief=taskBrief(row);
    section("任务说明",task.purpose||brief.description||
      "冻结任务未单独记录实施说明；请核对原始需求、执行步骤与验收条件。");
    section("必须完成什么 · 验收目标",brief.acceptance||
      "该任务尚无可独立验收目标，领取前必须按受控流程补齐。");
    section("对应需求",brief.requirementIds.length?brief.requirementIds:
      ["未记录对应需求编号；请核对冻结任务合同。"]);
    if(task.workflow?.length)section("已批准的执行步骤",task.workflow);
    else section("实施步骤的规格状态",
      "冻结任务未提供独立执行步骤，不能从标题推断实现方式。");
    const displayOwner=actual?.owner||(row.pending?localGit?.name:null);
    section("负责人 / 开发电脑",[
      translate("负责人")+": "+(displayOwner||
        (locale==="en"?"Not recorded on historical task":"历史任务未记录")),
      (locale==="en"?"Development machine: ":"开发电脑：")+
        (actual?.ownerAssignment?.device||localGit?.device||"—"),
      actual?.ownerAssignment?.decisionRef ?
        (locale==="en"?"Recorded at ":"记录于 ")+actual.ownerAssignment.decisionRef :
        (row.pending ?
          (locale==="en"?"Planning preview; recorded on task creation/claim":
            "规划预览；创建或领取任务时自动写入本机负责人") :
          (locale==="en"?"Historical attribution unavailable":"历史开发归属未记录")),
    ]);
    section("使用场景 / 触发条件 / 用户期望",task.scenario||"尚无独立业务场景说明");
    section("业务规则与不可变约束",task.businessRules||[]);
    if(task.inputs||task.outputs||task.preconditions||task.forbiddenChanges||
      task.stateTransitions||task.stopConditions||task.allowedChangedFiles){
      section(locale==="en"?"Frozen input contract":"冻结的输入契约",task.inputs||[]);
      section(locale==="en"?"Required outputs":"必须产生的输出",task.outputs||[]);
      section(locale==="en"?"Execution preconditions":"执行前置条件",task.preconditions||[]);
      section(locale==="en"?"Required state transitions":"必须遵循的状态转换",task.stateTransitions||[]);
      section(locale==="en"?"Forbidden changes":"禁止擅自更改的内容",task.forbiddenChanges||[]);
      section(locale==="en"?"Stop and request review when":"停止开发并返回审核的条件",task.stopConditions||[]);
      section(locale==="en"?"Exact Git file allowlist":"精确 Git 变更文件白名单",task.allowedChangedFiles||[]);
    }
    section("技术方案与约束",task.designRef||actual?.spec?.designRef||"无设计链接");
    section("原始需求、Spec 与测试用例依据",task.sourceRefs||[]);
    section("已确认决策、限制和审查备注",task.reviewNotes||[]);
    section("待确认问题与阻塞决策",task.openQuestions||[]);
    section("正向测试",task.testCases||actual?.spec?.testCases||[]);
    section("异常 / 边界场景",task.negativeCases||actual?.spec?.negativeCases||[]);
    section("交付验收应保留的真实证据",task.verificationEvidence||[]);
    section("不在本任务范围",task.outOfScope||actual?.spec?.outOfScope||[]);
    section("交付文件 / 产物",task.deliverables||actual?.spec?.deliverables||[]);
    section("文件修改范围",brief.paths.length?brief.paths:
      ["未记录允许文件范围；领取前必须核对 execution-contract。"]);
    section("必须通过的质量门禁",brief.gates.length?brief.gates:
      ["未记录质量门禁；必须核对 execution-contract。"]);
    section("依赖、阶段与允许变更",[
      "所属阶段："+row.phase,"父任务："+(task.parentId||"无"),
      "前置依赖："+((task.dependsOn||actual?.dependsOn||[]).join("、")||"无"),
      "允许路径："+((task.allowedPaths||actual?.allowedPaths||[]).join("；")||"未明确"),
      "验收 Gate："+((task.requiredGates||actual?.requiredGates||[]).join("、")||"尚未配置"),
    ]);
    showDelivery();
    if(row.pending)section("规格缺口与审核提示",[
      ...(!task.scenario?["缺少用户或系统触发条件及成功输出。"]:[]),
      ...((task.workflow||[]).length<3?["缺少端到端步骤与状态转换。"]:[]),
      ...((task.testCases||[]).length<=1?["正向测试场景不足，需要按相关 Spec 核验边界覆盖。"]:[]),
      ...((task.negativeCases||[]).length<=1?["反例目前只有一条，不能代表所有失败与异常分支。"]:[]),
      "由当前开发 Agent 自检任务覆盖、范围和测试，并提交计划确认。无需额外审核 Agent；重大范围变更仍需 Owner 授权。",
    ]);
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
