  // Genuine, read-only project facts. The UI cannot approve an Idea, claim a
  // task or promote a test Gate. Those actions remain in the controlled MCP.
  function metric(label,value,caption){
    const card=n('div',null,'insight-metric');
    card.append(n('strong',String(value)),n('span',label));
    if(caption)card.append(n('small',caption));
    return card;
  }
  async function openIdea(id){
    $('overlay').classList.add('open');
    $('doc-title').textContent='读取 Idea 与审核记录…';
    $('doc-source').textContent=id+' · 项目 SQLite';
    const root=$('doc-content');root.replaceChildren(n('p','只读读取原始依据…'));
    try{
      const data=await fetchJSON('/api/ideas/'+encodeURIComponent(id));
      $('doc-title').textContent=data.title;
      $('doc-source').textContent=id+' · '+data.release+' · '+data.status+' · 修订 '+data.revision;
      root.replaceChildren();
      const panel=(title,value)=>{
        const section=n('section',null,'spec-block');
        section.append(n('h3',title));
        if(value===undefined||value===null)section.append(n('p','尚无这一步的实际审核记录。'));
        else if(typeof value==='string')section.append(n('p',value));
        else section.append(n('pre',JSON.stringify(value,null,2),'spec-raw'));
        root.append(section);
      };
      panel('原始想法与目的',data.description);
      panel('提交依据',data.sourceRef);
      panel('影响评估',data.assessment);
      panel('独立复审',data.review);
      panel('Owner 最终决定',data.disposition);
      panel('完整修订记录',data.history);
      root.append(n('p','本页只显示已记录的判断与证据，不构成审批操作；修改和决定需通过受控 DevControl。','sub'));
    }catch(e){root.replaceChildren(n('p','Idea 读取失败：'+e.message,'error'));}
  }
  function guidanceRow(title,detail,target){
    const line=n(target?'button':'div',null,'insight-row');
    if(target){line.type='button';line.addEventListener('click',()=>go(target));}
    line.append(n('strong',title),n('span',detail));
    if(target)line.append(n('small','查看 '+titles[target]+' ↗'));
    return line;
  }
  function renderInsights(){
    if(!insights){
      for(const id of ['overview-insight-actions','idea-list','guide-project-context'])
        $(id).replaceChildren(n('div','项目审核摘要暂不可读取，请刷新后核对原始 SQLite 记录。','docs-empty'));
      $('idea-count').textContent='暂不可用';
      return;
    }
    const ideas=insights.ideas||[],bugs=insights.bugs||[];
    const openIdeas=ideas.filter(i=>!i.hasDecision);
    const pendingFeatures=(insights.features||[]).filter(f=>f.status!=='frozen');
    const problematic=bugs.filter(b=>b.completedSteps<b.totalSteps);
    $('overview-insight-metrics').replaceChildren(
      metric('尚未决策的 Idea',openIdeas.length,'不能直接开发'),
      metric('功能规划待复审或修订',pendingFeatures.length,'须分轮 Review，不强制第二个 Agent'),
      metric('SRC-8 尚未结束的 Bug',problematic.length,'不代表修复完成'),
      metric('有前置阻断的任务',insights.taskState.blocked,'不能领取')
    );
    const actions=[];
    if(openIdeas.length)actions.push(guidanceRow('新想法需要评估与决定',
      openIdeas.length+' 项没有最终决策，审批记录独立于实施任务。','requirements'));
    if(pendingFeatures.length)actions.push(guidanceRow('规划仍有待审范围',
      pendingFeatures.length+' 个 Feature 尚未冻结，不可当作已经授权的工作。','tasks'));
    if(problematic.length)actions.push(guidanceRow('缺陷分析仍有未完成步骤',
      problematic.length+' 条 Bug 的 SRC-8 尚未完成，点击查看分阶段取证。','issues'));
    if(!actions.length)actions.push(guidanceRow('未发现以上待决策项',
      '这不代表全部外部 Gate 已通过。请继续核查测试与发布证据。','tasks'));
    $('overview-insight-actions').replaceChildren(...actions);
    $('idea-count').textContent=ideas.length+' 条真实记录，'+openIdeas.length+' 条未决策';
    $('idea-list').replaceChildren(...(ideas.length?ideas.map(i=>{
      const status=i.hasDecision?'已记录决定':i.hasReview?'已独立审核，待决定':
        i.hasAssessment?'已评估，待复审':'仅捕获，待评估';
      const card=n('button',null,'insight-row');card.type='button';
      card.append(n('strong',i.title),
        n('span',i.id+' · '+i.release+' · '+status+' · 修订 '+i.revision),
        n('small','依据 '+(i.sourceRef||'未提供来源')+' · '+(i.updatedAt||'时间未知')));
      card.addEventListener('click',()=>openIdea(i.id));
      return card;
    }):[guidanceRow('当前无 Idea 记录',
      '新想法应通过 DevControl 的 idea-capture、idea-assess、idea-review、idea-decide 进入正式审批。') ]));
    const completeBugs=bugs.filter(b=>b.completedSteps===b.totalSteps);
    $('bug-insight-metrics').replaceChildren(
      metric('Bug 记录',bugs.length,'全部来自当前项目 SQLite'),
      metric('八阶段分析已完成',completeBugs.length,'不代表修复任务已验证'),
      metric('存在受阻分析步骤',bugs.filter(b=>b.blockedSteps).length),
      metric('已关联回归任务',bugs.reduce((sum,b)=>sum+b.linkedTestTasks,0),'关联并非验收通过')
    );
    const readiness=[];
    if(onboarding&&onboarding.readiness!=='ready_for_review')
      readiness.push(guidanceRow('项目接入基线尚不完整',onboarding.nextAction||'请核查缺少的项目来源。','overview'));
    if(pendingFeatures.length)readiness.push(guidanceRow('先完成任务规划审核',
      pendingFeatures.length+' 个 Feature 仍待审核或修订，不能跳过 Owner 批准。','requirements'));
    if(insights.taskState.blocked)readiness.push(guidanceRow('检查依赖阻断',
      insights.taskState.blocked+' 项真实任务存在尚未通过的前置依赖。','tasks'));
    if(!readiness.length)readiness.push(guidanceRow('按当前冻结任务继续',
      '必须实际执行测试并提交证据；任务 Verified 不能代替发布验收。','tasks'));
    $('guide-project-context').replaceChildren(...readiness);
  }
