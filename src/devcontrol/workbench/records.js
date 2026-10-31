  async function showLanAccess(){
    $("overlay").classList.add("open");
    $("doc-title").textContent="局域网连接";
    $("doc-source").textContent="局域网中枢电脑直接打开，无须账号和密码";
    $("doc-content").replaceChildren(n("p","检查当前项目网络设置…","sub"));
    try{
      const d=await fetchJSON("/api/access");
      const lines=d.lanEnabled ? [
        "# 中枢电脑访问地址",...(d.urls||[]), "",
        "浏览器直接打开上述地址，即可查看需求、架构、任务和 History Session，无须登录。",
        "同一局域网中的其他设备也能够读取这些资料，请仅在受信任的私有网络中启用。"
      ] : [
        "# 当前仅允许本机访问",
        "当前项目尚未启用局域网模式；可用 DevControl lan-enable 开启私有局域网只读访问。",
        "启用后无需账号密码，其他私有局域网设备可直接打开当前项目地址。"
      ];
      markdown($("doc-content"),lines.join("\n\n"));
    }catch{
      $("doc-content").replaceChildren(n("p",
        "无法获取当前项目的局域网地址，请检查 MCP 服务和网络连接。","error"));
    }
  }
  async function loadDatabaseDesign(){
    const root=$('database-design-sources'),tableRoot=$('database-design-tables');
    try{
      const data=await fetchJSON('/api/architecture/database');
      const cards=[];
      for(const source of data.documents||[]){
        const button=n('button',null,'insight-row');button.type='button';
        button.append(n('strong','正式架构 / 数据契约'),n('span',source),
          n('small','读取项目 Git 文档 ↗'));
        button.addEventListener('click',()=>openDoc(source));cards.push(button);
      }
      for(const source of data.migrations||[]){
        const card=n('div',null,'insight-row');
        card.append(n('strong','SQL 迁移源码'),n('span',source.path),
          n('small',(source.tables||[]).length+' 张表 · 源码存在不代表已部署'));
        cards.push(card);
      }
      if(data.implementation?.length){
        const card=n('div',null,'insight-row');
        card.append(n('strong','持久化实现与迁移安全约束'),
          n('span',data.implementation.join(' · ')),
          n('small','仅显示实际源码路径，不执行任何数据库操作'));
        cards.push(card);
      }
      for(const review of data.designReviews||[]){
        const card=workItemButton(review);
        card.classList.add('insight-row');
        cards.push(card);
      }
      root.replaceChildren(...(cards.length?cards:[n('div',
        '当前没有已登记的数据库设计审核或正式数据库迁移。可先通过 DevControl 建立受控架构变更记录。','docs-empty')]));
      const tables=data.migrations?.flatMap(m=>m.tables)||[];
      const unique=[...new Set(tables)];
      $('database-design-status').textContent=(data.designReviews||[]).length+
        ' 项 SQLite 架构评审 · '+unique.length+' 张迁移源码表 · 未验证实际部署';
      tableRoot.replaceChildren(...(unique.length?[
        n('h3','数据库实体 / 设计表名'),
        (()=>{const list=n('div',null,'database-tables-grid');
          for(const name of unique)list.append(n('code',name,'database-table-name'));
          return list;})(),
      ]:[n('p','尚无正式迁移 SQL。SQLite 中的设计评审与 Git 概念契约请从上方记录查看。','sub')]));
    }catch(error){
      root.replaceChildren(n('div','数据库设计读取失败：'+error.message,'error'));
      $('database-design-status').textContent='读取失败';
    }
  }
  function workItemButton(item){
    const b=n("button",null,"docitem");b.type="button";
    b.append(n("span",item.id+" · "+item.status,"taskid"),
      n("b",item.title),
      n("small",[item.sourceRef,item.topLevelDocument].filter(Boolean).join(" · ")||"DevControl SQLite"));
    b.addEventListener("click",()=>{
      if(item.kind==="bug"){openBug(item.id);return;}
      $("overlay").classList.add("open");
      $("doc-title").textContent=item.title;
      $("doc-source").textContent=item.id+" · "+item.status;
      markdown($("doc-content"),[
        "# 变更内容",item.description,
        "# 来源",item.sourceRef||"未填写",
        "# 对应功能",item.featureName||"未关联",
        "# 顶层架构",item.topLevelDocument||"尚未指定",
        "# 记录者与设备",(item.creator||"—")+" / "+(item.device||"—"),
      ].join("\n\n"));
    });return b;
  }
  async function loadIssues(){
    const container=$("issues-list");
    try{
      const data=await fetchJSON("/api/work-items");
      const items=(data.items||[]).filter(item=>item.kind==="bug");
      $("bug-list-count").textContent="共 "+items.length+" 条 Bug · 修复与回归以真实 Gate 为准";
      container.replaceChildren(...(items.length?items.map(workItemButton):
        [n("div","当前项目没有 Bug 记录。","docs-empty")]));
    }catch(e){container.replaceChildren(n("div","读取失败："+e.message,"error"));}
  }
  async function loadArchitectureChanges(){
    const container=$("architecture-changes");
    try{
      const data=await fetchJSON("/api/work-items");
      const items=(data.items||[]).filter(item=>item.kind!=="bug");
      $('architecture-change-count').textContent=items.length+' 项实际架构变更 · '+
        items.filter(item=>item.status!=='completed'&&item.status!=='resolved').length+' 项尚未完成';
      container.replaceChildren(...(items.length?items.map(workItemButton):
        [n("div","当前没有已登记的架构变更提案；Git ADR 仍在左侧架构文档中。","docs-empty")]));
    }catch(e){container.replaceChildren(n("div","读取失败："+e.message,"error"));}
  }
  async function openBug(id){
    $("overlay").classList.add("open");
    $("doc-title").textContent="正在加载 Bug…";
    $("doc-source").textContent=id+" · DevControl SRC-8";
    const root=$("doc-content");root.replaceChildren(n("p","读取 SRC-8 分析记录…","sub"));
    try{
      const data=await fetchJSON("/api/bugs/"+encodeURIComponent(id));
      $("doc-title").textContent=data.title;
      $("doc-source").textContent=id+" · "+data.status+" · "+(data.featureName||"未关联功能");
      root.replaceChildren();
      const completed=data.steps.filter(step=>step.status==="completed").length;
      const intro=n("div",null,"spec-block");
      intro.append(n("h3","SRC-8 分析进度 · "+completed+" / 8 步已完成"),
        n("p",data.description||"尚无问题描述"));root.append(intro);
      for(const step of data.steps){
        const panel=n("section",null,"spec-block");
        const header=n("h3",step.step+". "+step.title);
        const label=step.status==="completed"?"已完成":step.status==="in_progress"?
          "进行中":step.status==="blocked"?"已阻塞":"未开始";
        const meta=n("p",label+" · 修订 "+step.revision+
          (step.updatedBy?" · "+step.updatedBy:"")+
          (step.updatedAt?" · "+beijingDateTime(step.updatedAt):""),"sub");
        panel.append(header,meta);
        const details=n("details");
        if(step.status==="in_progress"||step.status==="blocked")details.open=true;
        details.append(n("summary","查看分析内容与证据"),
          n("p",step.summary||"尚未填写此步骤；待 Agent 按 start_bugfix 更新。"));
        const refs=n("ul");
        (step.evidence||[]).forEach(ref=>refs.append(n("li",ref)));
        if(refs.childNodes.length)details.append(n("h3","关联证据"),refs);
        panel.append(details);root.append(panel);
      }
      const related=n("section",null,"spec-block");
      related.append(n("h3","关联的修复与回归测试任务"));
      if(data.links.length)for(const link of data.links){
        const row=taskRows().find(t=>t.item.id===link.taskId);
        if(row){
          const button=n('button',(link.role==='test'?'测试 · ':'修复 · ')+
            link.taskId+' · '+link.title+' · '+link.status+' ↗','insight-row');
          button.type='button';button.addEventListener('click',()=>openPlanTask(row));
          related.append(button);
        }else related.append(n('p',(link.role==='test'?'测试 · ':'修复 · ')+
          link.taskId+' · '+link.title+' · '+link.status+'（当前计划未包含此任务）'));
      }else related.append(n("p","尚无关联的执行任务。SRC-8 取证记录不代表已批准开发。"));
      root.append(related);
    }catch(e){root.replaceChildren(n("p","Bug 详情读取失败："+e.message,"error"));}
  }
  async function loadHistory(){
    const container=$("history-list");
    try{
      const q=$("history-search").value.trim();
      const data=await fetchJSON("/api/history?q="+encodeURIComponent(q)+"&limit=30");
      $("history-list-count").textContent="本次检索 "+data.results.length+" 条 · SQLite History";
      container.replaceChildren(...(data.results.length?data.results.map(hit=>{
        const b=n("button",null,"docitem");b.type="button";
        b.append(n("span","SESSION #"+hit.number,"taskid"),n("b",hit.title),
          n("small",hit.path+" · "+(hit.updated_at?beijingDateTime(hit.updated_at):"时间未知") ));
        b.addEventListener("click",()=>openHistory(hit.number,hit.title));
        return b;
      }):[n("div","暂无项目历史会话或搜索无结果。","docs-empty")]));
    }catch(e){container.replaceChildren(n("div","读取失败："+e.message,"error"));}
  }
  async function openHistory(number,title){
    $("overlay").classList.add("open");$("doc-title").textContent=title;
    $("doc-source").textContent="History Session #"+number+" · 项目本地归档";
    $("doc-content").replaceChildren(n("p","读取历史检查点中…"));
    try{
      let cursor=0,expectedHash="",pages=[];
      // Bounded original API: same hash through cursor pagination.
      for(let i=0;i<32;i++){
        const data=await fetchJSON("/api/history/"+number+"?cursor="+cursor+
          "&expected_hash="+encodeURIComponent(expectedHash));
        pages.push(data.content);
        expectedHash=data.content_hash;
        if(data.next_cursor===null)break;
        cursor=data.next_cursor;
      }
      markdown($("doc-content"),pages.join(""));
    }catch(e){$("doc-content").replaceChildren(n("p","无法读取历史："+e.message,"error"));}
  }
