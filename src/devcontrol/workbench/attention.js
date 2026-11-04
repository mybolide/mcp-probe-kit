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
    if(!['all',...attentionOrder].includes(kind))return;
    attentionFilter=kind;
    $('task-search').value='';
    $('task-stage-filter').value='';
    $('task-type-filter').value='';
    attentionVisibleLimit=12;
    setTaskTab('attention');
    go('tasks');
    // Re-run after routing so the on-screen filter and count agree.
    renderTaskList();
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
      const main=n('span',null,'attention-item-main');
      const meta=n('span',null,'attention-item-meta');
      meta.append(n('span',attentionLabels[kind],'attention-type '+kind),
        n('span',row.item.id,'attention-id'));
      main.append(meta,n('strong',displayTaskTitle(row.item)),
        n('small',taskAttentionReason(row)));
      button.append(main,n('span','查看详情 ↗','attention-item-action'));
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
