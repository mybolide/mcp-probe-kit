  let guideLoaded=false,guideIntent='start';
  async function loadGuide(){
    if(!guideLoaded){
      try{
        const catalog=await fetchJSON('/api/guide');
        const root=$('guide-intents');root.replaceChildren();
        for(const item of catalog.intents||[]){
          const button=n('button',null,'guide-intent');button.type='button';
          button.dataset.intent=item.intent;
          button.append(n('strong',item.description),n('small',item.firstAction));
          button.addEventListener('click',()=>selectGuideIntent(item.intent));root.append(button);
        }
        guideLoaded=true;
      }catch(error){$('guide-description').textContent='导航暂不可用：'+error.message;return;}
    }
    await selectGuideIntent(guideIntent);
  }
  for(const control of document.querySelectorAll('#view-settings input,#view-settings select')){
    control.addEventListener('input',renderSettingsDiff);
    control.addEventListener('change',renderSettingsDiff);
  }
  async function selectGuideIntent(intent){
    guideIntent=intent;
    document.querySelectorAll('.guide-intent').forEach(b=>
      b.classList.toggle('selected',b.dataset.intent===intent));
    try{
      const data=await fetchJSON('/api/guide?intent='+encodeURIComponent(intent));
      const flow=data.flow;
      if(!flow)return;
      $('guide-title').textContent=flow.description;
      $('guide-description').textContent='按当前阶段执行 · 只显示相关操作和执行边界';
      $('guide-actions').replaceChildren(...flow.actions.map((action,index)=>
        n('span',(index+1)+'  '+action,'guide-action')));
      $('guide-example').textContent=JSON.stringify(flow.example,null,2);
      $('guide-caution').textContent='注意：'+flow.caution;
    }catch(error){$('guide-description').textContent='导航暂不可用：'+error.message;}
  }
  let settingsLoaded=false,settingsToken='',settingsBaseline=null;
  const settingValue=id=>$(id).value.trim();
  const settingInputs={
    MCP_ENABLE_UI_APPS:'flag-ui-apps',MCP_ENABLE_GITNEXUS_BRIDGE:'flag-gitnexus',
    MEMORY_EMBEDDING_PROVIDER:'setting-provider',MEMORY_EMBEDDING_MODEL:'setting-model',
    MEMORY_EMBEDDING_URL:'setting-embedding-url',MEMORY_QDRANT_URL:'setting-qdrant-url',
    MEMORY_QDRANT_COLLECTION:'setting-collection',MEMORY_SEARCH_LIMIT:'setting-search-limit',
    MEMORY_SUMMARY_MAX_CHARS:'setting-summary-max',
  };
  let effectiveSettingSources={};
  function settingsDraft(){
    return {
      MCP_ENABLE_UI_APPS:$('flag-ui-apps').checked,
      MCP_ENABLE_GITNEXUS_BRIDGE:$('flag-gitnexus').checked,
      MEMORY_EMBEDDING_PROVIDER:settingValue('setting-provider'),
      MEMORY_EMBEDDING_MODEL:settingValue('setting-model'),
      MEMORY_EMBEDDING_URL:settingValue('setting-embedding-url'),
      MEMORY_QDRANT_URL:settingValue('setting-qdrant-url'),
      MEMORY_QDRANT_COLLECTION:settingValue('setting-collection'),
      MEMORY_SEARCH_LIMIT:settingValue('setting-search-limit'),
      MEMORY_SUMMARY_MAX_CHARS:settingValue('setting-summary-max'),
    };
  }
  function renderSettingsDiff(){
    if(!settingsBaseline)return;
    const current=settingsDraft();
    const changed=Object.keys(current).filter(key=>current[key]!==settingsBaseline[key]);
    const secrets=[['setting-qdrant-key','MEMORY_QDRANT_API_KEY'],
      ['setting-embedding-key','MEMORY_EMBEDDING_API_KEY']];
    for(const [id,key] of secrets)if(settingValue(id))changed.push(key+' · 待替换（不回显）');
    for(const [id,key] of [['clear-qdrant-key','MEMORY_QDRANT_API_KEY'],
      ['clear-embedding-key','MEMORY_EMBEDDING_API_KEY']])if($(id).checked)
      changed.push(key+' · 请求清除');
    $('settings-diff').replaceChildren(...(changed.length?
      changed.map(key=>n('div',key,'insight-change')):
      [n('div','与上次读取的配置一致，尚无待保存变更。','sub')]));
  }
  function renderSettingStates(data){
    $('flag-ui-apps').checked=!!data.flags.MCP_ENABLE_UI_APPS.effective;
    $('flag-gitnexus').checked=!!data.flags.MCP_ENABLE_GITNEXUS_BRIDGE.effective;
    $('setting-provider').value=data.ai.MEMORY_EMBEDDING_PROVIDER.value||'ollama';
    $('setting-model').value=data.ai.MEMORY_EMBEDDING_MODEL.value||'';
    $('setting-embedding-url').value=data.ai.MEMORY_EMBEDDING_URL.value||'';
    $('setting-qdrant-url').value=data.ai.MEMORY_QDRANT_URL.value||'';
    $('setting-collection').value=data.ai.MEMORY_QDRANT_COLLECTION.value||'';
    $('setting-search-limit').value=data.ai.MEMORY_SEARCH_LIMIT.value||'3';
    $('setting-summary-max').value=data.ai.MEMORY_SUMMARY_MAX_CHARS.value||'280';
    $('embedding-key-state').textContent=data.secrets.MEMORY_EMBEDDING_API_KEY.configured?
      '已保存 · '+data.secrets.MEMORY_EMBEDDING_API_KEY.source:'未设置';
    $('qdrant-key-state').textContent=data.secrets.MEMORY_QDRANT_API_KEY.configured?
      '已保存 · '+data.secrets.MEMORY_QDRANT_API_KEY.source:'未设置';
    $('setting-embedding-key').value='';
    $('setting-qdrant-key').value='';
    $('clear-embedding-key').checked=false;
    $('clear-qdrant-key').checked=false;
    const embeddingEnv=data.secrets.MEMORY_EMBEDDING_API_KEY.source==='client-env';
    const qdrantEnv=data.secrets.MEMORY_QDRANT_API_KEY.source==='client-env';
    $('setting-embedding-key').disabled=embeddingEnv;
    $('clear-embedding-key').disabled=embeddingEnv;
    $('setting-qdrant-key').disabled=qdrantEnv;
    $('clear-qdrant-key').disabled=qdrantEnv;
    effectiveSettingSources={...data.flags,...data.ai};
    for(const [key,id] of Object.entries(settingInputs)){
      const input=$(id),source=effectiveSettingSources[key];
      input.disabled=!!source?.overridden;
      // Toggle labels are only 46px wide. Attribution text belongs to the
      // full settings row, never inside the switch (which made it vertical).
      const container=input.closest('.settings-switch-row')||input.closest('label');
      if(!container)continue;
      let label=container.querySelector('[data-env-source]');
      if(!label){label=n('small',null,'settings-env-source');
        label.dataset.envSource='true';container.append(label);}
      label.textContent=source?.overridden?'当前工作台进程环境变量 · 只读':
        source?.source==='project'?'项目配置覆盖值':'默认值，可配置';
    }
  }
  async function loadSettings(){
    if(settingsLoaded)return;
    try{
      const [meta,access,data,currentProject]=await Promise.all([
        fetchJSON('/api/meta'),fetchJSON('/api/access'),fetchJSON('/api/settings'),
        fetchJSON('/api/project'),
      ]);
      settingsToken=data.csrfToken;
      renderSettingStates(data);
      settingsBaseline=settingsDraft();renderSettingsDiff();
      settingsBaseline=settingsDraft();renderSettingsDiff();
      const overridden=Object.entries(data.ai).filter(([,value])=>value.overridden)
        .map(([name])=>name);
      if(overridden.length) $('settings-feedback').textContent=
        '注意：'+overridden.join('、')+' 已由当前工作台进程环境变量指定，只读且不会写入项目覆盖值。其他独立 MCP 客户端进程的环境配置无法从浏览器直接读取。';
      const rows=[
        ['项目','当前 Git 项目 · '+(currentProject?.name||'未知')],
        ['当前分支',currentProject?.git?.branch||'未识别'],
        ['工作台访问',access.lanEnabled?'允许私有局域网只读':'仅本机'],
        ['配置权限','仅本机 · 同源授权'],
        ['mcp-probe-kit 版本',meta.version||'未知'],
        ['生效时间','重连 MCP 后生效'],
        ['配置优先级','当前工作台进程环境变量 > 项目保存值 > 默认值'],
      ];
      $('settings-status').replaceChildren(...rows.map(([label,value])=>{
        const div=n('div',null,'settings-row');
        div.append(n('strong',label),n('span',value));return div;
      }));
      settingsLoaded=true;
    }catch(error){
      $('settings-status').replaceChildren(n('p','设置只允许在服务器本机查看和修改。','sub'));
      $('settings-save').disabled=true;
      $('settings-feedback').textContent='当前连接只读；请通过本机 127.0.0.1 地址打开设置。';
    }
  }
  async function saveSettings(){
    if(!settingsToken)return;
    const button=$('settings-save'),status=$('settings-feedback');
    button.disabled=true;status.textContent='正在保存项目设置…';
    const secrets={};
    const emb=settingValue('setting-embedding-key');
    const qdr=settingValue('setting-qdrant-key');
    if(!$('setting-embedding-key').disabled){
      if($('clear-embedding-key').checked)secrets.MEMORY_EMBEDDING_API_KEY=null;
      else if(emb)secrets.MEMORY_EMBEDDING_API_KEY=emb;
    }
    if(!$('setting-qdrant-key').disabled){
      if($('clear-qdrant-key').checked)secrets.MEMORY_QDRANT_API_KEY=null;
      else if(qdr)secrets.MEMORY_QDRANT_API_KEY=qdr;
    }
    try{
      const draft=settingsDraft(),flags={},ai={};
      for(const [key,id] of Object.entries(settingInputs)){
        if($(id).disabled||draft[key]===settingsBaseline?.[key])continue;
        if(key.startsWith('MCP_ENABLE_'))flags[key]=draft[key];
        else ai[key]=draft[key];
      }
      const response=await fetch('/api/settings',{
        method:'POST',headers:{
          'Content-Type':'application/json','X-MCP-Settings-Token':settingsToken,
        },cache:'no-store',body:JSON.stringify({
          flags,ai,secrets,
        }),
      });
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      settingsToken=data.csrfToken;
      renderSettingStates(data);
      const overridden=Object.entries(data.ai).filter(([,value])=>value.overridden)
        .map(([name])=>name);
      status.textContent='已保存当前项目 MCP 环境参数。重连后生效。'+
        (overridden.length?' 注意：客户端 env 优先覆盖 '+overridden.join('、')+'。':'');
    }catch(error){
      status.textContent='保存失败：'+error.message+'。请检查输入或是否从本机打开。';
    }finally{
      // Never retain token input in the DOM after submitting.
      $('setting-embedding-key').value='';
      $('setting-qdrant-key').value='';
      button.disabled=false;
    }
  }
