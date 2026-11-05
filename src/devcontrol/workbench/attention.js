  // Human work queue derived exclusively from the existing frozen plan and
  // live SQLite task rows. Labels represent observations, never approval.
  function taskAttentionKind(row){
    // Real final verification wins over a stale candidate planning snapshot.
    if(row.current?.status==='verified')return null;
    if(row.pending)return 'planning';
    if(row.status==='verified'||row.status==='cancelled')return null;
    if(row.current?.pendingVerification||row.status==='in_review')return 'verification';
    if(row.status==='in_progress')return 'active';
    if(row.current?.blockedBy?.length||row.current?.unverifiedChildren?.length)return 'blocked';
    if(row.status==='ready')return 'ready';
    return null;
  }
  const attentionOrder=['verification','active','blocked','planning','ready'];
  const attentionLabels={verification:'待验收',active:'开发中',
    blocked:'依赖受阻',planning:'规划待确认',ready:'可继续'};
  const attentionDescriptions={
    verification:'需要核对当前 Gate 的真实测试和验收证据，页面不能代替验收',
    active:'任务正在执行，先查看已记录的进展和完成条件',
    blocked:'前置依赖尚未通过，先检查依赖来源，不应抢先领取',
    planning:'候选规划未获最终批准，先核对规划及审批记录',
    ready:'已登记的任务没有已知前置阻断，仍须按正式范围领取',
  };
  let homeDecisionRequests=[];
  function renderHomeFeatureChanges(){
    const host=$('home-feature-list');
    host.replaceChildren();
    const latest=[...(features||[])].filter(item=>item&&item.updatedAt)
      .sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,3);
    if(!latest.length){
      host.append(n('p','还没有可读取的 Feature 修订记录。','home-side-empty'));
      return;
    }
    for(const feature of latest){
      const item=n('button',null,'home-feature-row');
      item.type='button';
      const date=beijingDateTime(feature.updatedAt);
      const parsed=new Date(feature.updatedAt);
      const shortDate=Number.isNaN(parsed.getTime())?date:
        new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',
          month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
          hour12:false}).format(parsed);
      const when=n('span',shortDate,'home-feature-time');
      when.title=date;
      item.append(when);
      const detail=n('span',null,'home-feature-name');
      detail.append(n('strong',feature.description||feature.name),
        n('small',feature.name));
      item.append(detail,n('span','v'+feature.revision,'home-feature-version'));
      item.addEventListener('click',()=>openFeature(feature.name));
      item.setAttribute('aria-label','查看 Feature '+feature.name+' 的第 '+feature.revision+' 版');
      host.append(item);
    }
  }
  async function openHomeDecision(id,action){
    go('requirements');
    $('decision-request-filter').value='pending';
    await loadDecisionRequests();
    const row=[...document.querySelectorAll('#decision-request-list [data-decision-id]')]
      .find(item=>item.dataset.decisionId===id);
    if(!row)return;
    row.scrollIntoView({block:'center',behavior:'smooth'});
    const select=row.querySelector('select');
    if(select){
      const choice=action==='reject'?'__reject':action==='defer'?'__defer':
        homeDecisionRequests.find(item=>item.id===id)?.recommendedOption;
      if(choice){select.value=choice;select.dispatchEvent(new Event('change'));}
      (action==='defer'?row.querySelector('.decision-request-defer input'):select)?.focus();
    }
  }
  function renderHomeDecisions(){
    const host=$('home-decision-list'),pending=homeDecisionRequests.length;
    $('s-decision-pending').textContent=String(pending);
    $('home-decision-heading-count').textContent='('+pending+')';
    $('header-decision-dot').hidden=pending===0;
    host.replaceChildren();
    if(!pending){
      const empty=n('div',null,'home-decision-empty');
      empty.append(n('span','✓','home-decision-empty-icon'),
        n('strong','当前没有待确认决策'),
        n('p','新的 Feature 问题由 Agent 登记后，会在这里显示。'));
      host.append(empty);return;
    }
    for(const request of homeDecisionRequests.slice(0,3)){
      const item=n('article',null,'home-decision-row');
      const head=n('div',null,'home-decision-info');
      const glyph=n('span',null,'home-decision-glyph');
      glyph.append(n('span','▤'));
      const detail=n('div',null,'home-decision-detail');
      detail.append(n('strong',request.title||request.question),
        n('small',request.featureName+' · '+
          (request.stale?'来源已更新，需重新确认':
            request.options?.find(option=>option.id===request.recommendedOption)?.label?
              '推荐方案：'+request.options.find(option=>option.id===request.recommendedOption).label:
              '请查看备选方案')));
      head.append(glyph,detail);item.append(head);
      if(request.stale){
        const btn=n('button','重新查看问题','home-decision-secondary');
        btn.type='button';btn.addEventListener('click',()=>openHomeDecision(request.id,'view'));
        item.append(btn);
      }else{
        const actions=n('div',null,'home-decision-actions');
        for(const [action,label,cls] of [
          ['recommend',request.recommendedOption?'✓ 采用推荐方案':'查看方案','primary'],
          ['reject','× 不做','secondary'],['defer','◷ 延期','secondary']]){
          const btn=n('button',label,'home-decision-'+cls);btn.type='button';
          btn.addEventListener('click',()=>openHomeDecision(request.id,action));
          actions.append(btn);
        }
        item.append(actions);
      }
      host.append(item);
    }
    if(pending>3)host.append(n('p','另有 '+(pending-3)+' 项待确认，请在需求管理中查看。',
      'home-decision-more'));
  }
  async function refreshHomeDecisions(){
    try{
      const response=await fetchJSON('/api/decision-requests?status=pending');
      homeDecisionRequests=Array.isArray(response.requests)?response.requests:[];
      renderHomeDecisions();
    }catch{
      $('s-decision-pending').textContent='—';
      $('home-decision-heading-count').textContent='';
      $('home-decision-list').replaceChildren(n('p',
        '暂时无法读取决策，请进入需求管理核对真实记录。','home-side-empty'));
    }
  }
  function attentionCounts(rows){
    const counts={verification:0,active:0,blocked:0,planning:0,ready:0};
    for(const row of rows){const kind=taskAttentionKind(row);if(kind)counts[kind]++;}
    return counts;
  }
  function taskAttentionReason(row){
    const kind=taskAttentionKind(row);
    if(kind==='verification'){
      const evidence=row.current?.pendingVerification;
      return evidence?.reason||
        (evidence?.gate?'待验证 Gate：'+evidence.gate:'需检查实际提交和验收证据');
    }
    if(kind==='blocked')return '等待前置任务：'+[
      ...(row.current?.blockedBy||[]),...(row.current?.unverifiedChildren||[])].join('、');
    if(kind==='planning')return row.item.featureNeedsRevision?
      '当前规格需修订，不能直接领取':
      '待批准规划，不属于正式可执行任务';
    return attentionDescriptions[kind]||'请核对正式任务来源';
  }
  function openAttentionTask(row){
    // The same authoritative task drawer as every normal task card.
    openPlanTask(row);
  }
  function showTaskFocus(kind){
    // Homepage signals are explanations, not another task-state taxonomy.
    // Link directly to an EXISTING lifecycle tab; keep real task badges.
    if(!['all',...attentionOrder].includes(kind))return;
    const tab=['verification','active'].includes(kind)?'in_progress':'not_started';
    $('task-search').value='';
    $('task-stage-filter').value='';
    $('task-type-filter').value='';
    setTaskTab(tab);
    go('tasks');
  }
  function renderAttentionCenter(){
    if(!board){
      $('attention-description').textContent='暂时没有读取到任务台账，请同步后核对';
      return;
    }
    const rows=currentReleaseRows(),counts=attentionCounts(rows);
    for(const kind of ['verification','blocked','planning','ready']){
      $('attention-'+kind+'-count').textContent=String(counts[kind]);
    }
    const ordered=rows.filter(row=>taskAttentionKind(row)).sort((a,b)=>{
      const ap=attentionOrder.indexOf(taskAttentionKind(a));
      const bp=attentionOrder.indexOf(taskAttentionKind(b));
      if(ap!==bp)return ap-bp;
      return (a.item.id||'').localeCompare(b.item.id||'',undefined,{numeric:true});
    });
    // Show a small, diverse selection instead of five nearly identical
    // overdue devices. The full read-only queue remains one click away.
    const chosen=[],seen=new Set();
    for(const kind of attentionOrder){
      const row=ordered.find(item=>taskAttentionKind(item)===kind);
      if(row&&!seen.has(row.item.id)){
        chosen.push(row);seen.add(row.item.id);
      }
      if(chosen.length===4)break;
    }
    for(const row of ordered){
      if(chosen.length>=4)break;
      if(!seen.has(row.item.id)){chosen.push(row);seen.add(row.item.id);}
    }
    const list=$('attention-list');
    list.replaceChildren();
    for(const row of chosen){
      const kind=taskAttentionKind(row),button=n('button',null,'attention-item');
      button.type='button';button.dataset.taskid=row.item.id;
      const left=n('span',null,'home-task-left');
      left.append(n('span',attentionLabels[kind],'attention-type '+kind),
        n('span',row.item.id,'attention-id'));
      const main=n('span',null,'attention-item-main');
      main.append(n('strong',displayTaskTitle(row.item)),
        n('small',taskAttentionReason(row)));
      const side=n('span',null,'home-task-side');
      const [status]=taskStatus(row);
      side.append(n('span',status,'home-task-status '+
        (row.status==='in_progress'||row.status==='in_review'?'is-active':
          row.status==='ready'?'is-ready':'is-pending')));
      const owner=row.current?.owner||row.item.owner;
      if(owner){
        const person=n('span',null,'home-task-person');
        person.append(n('span',String(owner).trim().slice(0,1).toUpperCase(),
          'home-task-avatar'),n('span',String(owner),'home-task-owner'));
        side.append(person);
      }
      side.append(n('span','查看详情 →','attention-item-action'));
      button.append(left,main,side);
      button.setAttribute('aria-label',row.item.id+' '+attentionLabels[kind]+' '+displayTaskTitle(row.item)+'，查看真实任务详情');
      button.addEventListener('click',()=>openAttentionTask(row));
      list.append(button);
    }
    if(!chosen.length)list.append(n('p','当前没有上述关注项。可进入任务管理查看完整台账。','attention-empty'));
    const total=counts.verification+counts.blocked+counts.planning+counts.active;
    $('attention-description').textContent='有 '+total+
      ' 项待验收、开发中、受阻或待确认的记录。这里优先展示不同类型的代表工作项。';
    const undecided=insights?.ideas?.filter(item=>!item.hasDecision).length;
    $('attention-idea-summary').textContent=undecided===undefined?
      '想法决策状态暂不可读取，请到需求管理核对':
      (undecided?'另外有 '+undecided+' 条 Idea 尚无最终决策':'当前没有待最终决策的 Idea 记录');
  }
