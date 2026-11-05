  // Feature questions live in their own SQLite inbox, not in task lifecycle.
  let decisionRequests=[];
  const decisionLabels={pending:'待确认',decided:'已选方案',
    rejected:'不做',deferred:'已延期',superseded:'已更新',withdrawn:'已撤回'};
  const decisionRetries=new Map();
  function decisionNode(tag,value,css){const el=n(tag,value,css);return el;}
  function decisionTextInput(tag,placeholder,cls=''){
    const input=n(tag,null,cls);
    if(placeholder)input.placeholder=placeholder;
    return input;
  }
  async function loadDecisionRequests(){
    const container=$('decision-request-list');
    try{
      const [list]=await Promise.all([fetchJSON('/api/decision-requests')]);
      decisionRequests=list.requests||[];
      renderDecisionRequests();
      if(typeof renderAttentionCenter==='function'&&board)renderAttentionCenter();
    }catch(error){
      $('decision-request-panel').classList.remove('is-empty');
      container.replaceChildren(n('p','决策列表读取失败：'+error.message,'sub'));
      $('decision-request-count').textContent='暂时无法读取';
    }
  }

  function renderDecisionRequests(){
    const visible=$('decision-request-filter').value==='all'?decisionRequests:
      decisionRequests.filter(item=>item.status==='pending');
    const pending=decisionRequests.filter(item=>item.status==='pending').length;
    $('decision-request-count').textContent=pending+' 项待确认';
    // A zero-item inbox should remain discoverable, not consume half a page.
    $('decision-request-panel').classList.toggle('is-empty',decisionRequests.length===0);
    const host=$('decision-request-list');host.replaceChildren();
    if(!visible.length){
      host.append(n('p',decisionRequests.length?
        '暂无待确认事项。需要时可切换为查看全部及历史结果。':
        '当前没有待确认事项。Agent 可以为现有 Feature 记录具体问题，不需要创建研发任务。','sub'));
      return;
    }
    for(const item of visible){
      const card=n('article',null,'decision-request-card');
      const head=n('div',null,'decision-request-head');
      const identity=n('div',null,'decision-request-identity');
      identity.append(n('small',item.id+' · '+item.featureName+' · 问题 v'+item.questionRevision),
        n('h3',item.title));
      head.append(identity,n('span',item.stale?'来源已更新':decisionLabels[item.status]||item.status,
        'decision-request-status'));
      card.append(head,n('p',item.question,'decision-request-question'));
      const background=n('p','背景：'+item.background,'decision-request-context');
      card.append(background);
      const impact=n('p',item.blocking?
        '可能影响规划 · 关联任务 '+(item.taskIds?.join('、')||'未列出'):
        '非阻塞确认 · 关联任务 '+(item.taskIds?.join('、')||'未列出'),
        'decision-request-impact');
      card.append(impact);
      if(item.status==='pending'&&!item.stale){
        const form=n('form',null,'decision-request-form');
        const label=n('label','你的选择');
        const choice=decisionTextInput('select',null,'decision-request-choice');
        for(const option of item.options){
          const text=option.label+(option.id===item.recommendedOption?' · 推荐':'');
          const node=n('option',text);node.value=option.id;choice.append(node);
        }
        for(const [value,title] of [['__reject','本次不做'],['__defer','延期']]){
          const option=n('option',title);option.value=value;choice.append(option);
        }
        if(item.recommendedOption)choice.value=item.recommendedOption;
        label.append(choice);form.append(label);
        const optionHelp=n('p','','decision-request-option-help');
        const updateChoice=()=>{
          const selected=item.options.find(option=>option.id===choice.value);
          optionHelp.textContent=selected?.description||(
            choice.value==='__defer'?'延期后仍需 Agent 更新 Feature 规划':
            '本次不做，仍需 Agent 重新核对影响范围');
          deferField.hidden=choice.value!=='__defer';
        };
        const deferField=n('label','延期目标','decision-request-defer');
        const deferInput=decisionTextInput('input','例如 V3 / 下一版健康功能');
        deferInput.maxLength=180;deferField.append(deferInput);
        const reasonField=n('label','补充说明（可选）');
        const reason=decisionTextInput('textarea','说明你的考虑或依据');
        reason.rows=2;reason.maxLength=3000;reasonField.append(reason);
        const actorField=n('label','确认人');
        const actor=decisionTextInput('input','输入你的称呼');
        actor.required=true;actor.maxLength=120;
        try{actor.value=localStorage.getItem('devcontrol-decision-actor')||'';}catch{}
        actorField.append(actor);
        const status=n('p','提交只记录决定，不修改任务合同或审批状态。','decision-request-message');
        const submit=n('button','提交确认','decision-request-submit');
        submit.type='submit';
        form.append(optionHelp,deferField,reasonField,actorField,submit,status);
        choice.addEventListener('change',updateChoice);updateChoice();
        form.addEventListener('submit',async event=>{
          event.preventDefault();
          if(!actor.value.trim()){actor.focus();return;}
          if(choice.value==='__defer'&&!deferInput.value.trim()){
            deferInput.focus();return;
          }
          const decision={expectedRevision:item.questionRevision,
            kind:choice.value==='__defer'?'deferred':
              choice.value==='__reject'?'rejected':'decided',
            optionId:choice.value.startsWith('__')?null:choice.value,
            rationale:reason.value.trim(),deferTo:deferInput.value.trim(),
            actor:actor.value.trim()};
          const fingerprint=JSON.stringify(decision);
          const previous=decisionRetries.get(item.id);
          const idempotencyKey=previous?.fingerprint===fingerprint?
            previous.key:'decision-'+Date.now().toString(36)+'-'+
              Math.random().toString(36).slice(2,12);
          decisionRetries.set(item.id,{fingerprint,key:idempotencyKey});
          submit.disabled=true;
          status.textContent='正在保存决策…';
          try{
            const auth=await fetchJSON('/api/decision-requests/access');
            const response=await fetch('/api/decision-requests/'+encodeURIComponent(item.id)+'/answer',{
              method:'POST',headers:{'content-type':'application/json',
                'x-mcp-decision-token':auth.csrfToken},
              body:JSON.stringify({...decision,idempotencyKey}),
            });
            const result=await response.json();
            if(!response.ok)throw Error(result.message||'提交失败：HTTP '+response.status);
            try{localStorage.setItem('devcontrol-decision-actor',decision.actor);}catch{}
            decisionRetries.delete(item.id);
            await loadDecisionRequests();
            // Keep the confirmed item visible with its audit history, even
            // when the list currently defaults to pending.
            $('decision-request-filter').value='all';
            renderDecisionRequests();
            const current=host.querySelector('[data-decision-id="'+item.id+'"]');
            const details=current?.querySelector('details');
            if(details){details.open=true;details.dispatchEvent(new Event('toggle'));}
          }catch(error){
            status.textContent=error.message+'。如问题已更新，请刷新后重新确认。';
            submit.disabled=false;
          }
        });
        card.append(form);
      }else if(item.decision){
        card.append(n('p','当前结果：'+(decisionLabels[item.decision.kind]||item.decision.kind)+
          (item.decision.optionId?' · '+(item.options.find(x=>x.id===item.decision.optionId)?.label||''):'')+
          (item.decision.deferTo?' · '+item.decision.deferTo:'')+
          '。研发计划仍需 Agent 评审。','decision-request-result'));
      }else if(item.stale){
        card.append(n('p','Feature 或提案已更新。请 Agent 重新发布问题版本，旧题目不能直接确认。',
          'decision-request-message'));
      }
      const details=n('details',null,'decision-request-history');
      details.append(n('summary','查看来源、方案与审计记录'));
      const content=n('div','点击后读取记录…','decision-request-history-body');
      details.append(content);
      details.addEventListener('toggle',async()=>{
        if(!details.open)return;
        try{
          const latest=await fetchJSON('/api/decision-requests/'+encodeURIComponent(item.id));
          content.replaceChildren();
          const sources=n('p','来源 Feature v'+latest.featureRevision+
            ' · '+(latest.sourceRefs?.join('、')||'无额外来源'));
          content.append(sources);
          for(const option of latest.options||[]){
            content.append(n('p',option.id+' · '+option.label+' · '+option.description));
          }
          const history=n('ol');
          for(const entry of latest.history||[]){
            const outcome=entry.decision?.kind||entry.event;
            history.append(n('li','v'+entry.revision+' · '+outcome+
              ' · '+entry.actor+' · '+entry.at+
              (entry.decision?.rationale?' · '+entry.decision.rationale:'')));
          }
          content.append(history);
        }catch(error){content.textContent='读取审计失败：'+error.message;}
      });
      card.dataset.decisionId=item.id;
      card.append(details);host.append(card);
    }
  }
