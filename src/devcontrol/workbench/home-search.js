  // Global search is a real project lookup, not a decorative input. It uses
  // already loaded authoritative task and Feature summaries; source details
  // open through the existing task/Feature readers.
  let homeSearchMatches=[];
  function renderGlobalSearch(){
    const input=$('global-search'),host=$('global-search-results');
    const query=input.value.trim().toLocaleLowerCase();
    host.replaceChildren();homeSearchMatches=[];
    if(!query){host.hidden=true;input.setAttribute('aria-expanded','false');return;}
    if(board){
      for(const row of currentReleaseRows()){
        const item=row.item;
        if([item.id,displayTaskTitle(item),item.description,item.scenario].some(value=>
          String(value||'').toLocaleLowerCase().includes(query))){
          homeSearchMatches.push({kind:'task',label:item.id+' · '+displayTaskTitle(item),
            detail:'工作项 · '+(row.current?.status||row.status),row});
        }
      }
    }
    for(const feature of features||[]){
      if([feature.name,feature.description].some(value=>
        String(value||'').toLocaleLowerCase().includes(query)))
        homeSearchMatches.push({kind:'feature',label:feature.name,
          detail:feature.description||'Feature · 版本 '+feature.revision,feature});
    }
    homeSearchMatches=homeSearchMatches.slice(0,7);
    if(!homeSearchMatches.length){
      const message=n('p','没有匹配的正式任务或 Feature，可在任务管理继续搜索。',
        'global-search-empty');host.append(message);
    }else{
      for(const match of homeSearchMatches){
        const row=n('button',null,'global-search-result');row.type='button';
        row.append(n('strong',match.label),n('small',match.detail));
        row.addEventListener('click',()=>openGlobalSearchResult(match));
        host.append(row);
      }
    }
    host.hidden=false;input.setAttribute('aria-expanded','true');
  }
  function closeGlobalSearch(){
    $('global-search-results').hidden=true;
    $('global-search').setAttribute('aria-expanded','false');
  }
  function openGlobalSearchResult(match){
    closeGlobalSearch();
    if(match.kind==='task')openPlanTask(match.row);
    else if(match.kind==='feature')openFeature(match.feature.name);
  }
  function submitGlobalSearch(){
    const q=$('global-search').value.trim();
    if(!q)return;
    if(homeSearchMatches.length){openGlobalSearchResult(homeSearchMatches[0]);return;}
    go('tasks');$('task-search').value=q;renderTaskList();
    $('task-search').focus();closeGlobalSearch();
  }
