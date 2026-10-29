  function requirementWorkState(rows){
    const verified=rows.filter(row=>row.status==="verified").length;
    const active=rows.some(row=>row.status==="in_progress"||row.status==="in_review");
    if(!rows.length)return {verified,label:"未拆分任务",state:"undivided"};
    if(rows.every(row=>row.pending))return {verified,label:"已拆分 · 待规划复核",state:"planned"};
    if(verified===rows.length)return {verified,label:"任务已完成 · 产品验收另行确认",state:"done"};
    if(active||verified)return {verified,label:"已拆分 · 开发中 / 待验收",state:"active"};
    return {verified,label:"已拆分任务 · 待开发",state:"planned"};
  }
  function openRequirement(req,linked,progress){
    $("overlay").classList.add("open");
    $("doc-title").textContent=req.id+" · "+req.title;
    $("doc-source").textContent="需求追踪 · "+progress.label;
    const content=$("doc-content");content.replaceChildren();
    const intro=n("section",null,"spec-block");
    intro.append(n("h3","验收重点"),n("p",req.acceptance),
      n("p","当前版本关联工作项 "+linked.length+" 项，Verified "+progress.verified+
        " 项。任务 Verified 不能代替需求或产品发布 Gate 的正式验收。"));
    const original=n("button","查看完整 PRD →","link");
    original.type="button";original.addEventListener("click",()=>openDoc("docs/product/requirements.md"));
    intro.append(original);content.append(intro);
    const heading=n("h3","关联工作项");content.append(heading);
    if(!linked.length){content.append(n("p","当前版本没有与本需求关联的正式工作项。"));return;}
    for(const row of linked){
      const button=n("button",null,"docitem");button.type="button";
      button.style.display="block";button.style.width="100%";button.style.marginBottom="8px";
      button.append(n("b",row.item.id+" · "+displayTaskTitle(row.item)),
        n("small",taskStatus(row)[0]+" · "+(row.item.acceptance||row.current?.spec?.acceptance||"尚无验收说明")));
      button.addEventListener("click",()=>openPlanTask(row));content.append(button);
    }
  }
  function setupDocs(){
    const docs=project.documents||[];
    const quick=["docs/product/vision.md","docs/product/requirements.md","docs/architecture/overview.md","docs/CONSTITUTION.md"];
    $("quickdocs").replaceChildren(...quick.map(p=>preview(docs.find(d=>d.path===p))));
    const specs=docs.filter(d=>d.path.startsWith("docs/specs/"));
    $("specdocs").replaceChildren(...(specs.length?specs.map(docButton):[n("div","暂无已发布功能规格","docs-empty")]));
    const linkedByRequirement=new Map();
    for(const row of currentReleaseRows())for(const id of (row.item.requirementIds||row.current?.spec?.requirementIds||[])){
      if(!linkedByRequirement.has(id))linkedByRequirement.set(id,[]);
      linkedByRequirement.get(id).push(row);
    }
    $("requirement-list").replaceChildren(...(project.requirements.items || []).map(req=>{
      const b=n("button",null,"docitem");b.type="button";
      const head=n("span",req.id,"taskid");
      const tag=n("span",req.stage,"chip");tag.style.float="right";
      const linked=linkedByRequirement.get(req.id)||[];
      const progress=requirementWorkState(linked);
      b.append(head,tag,n("b",req.title),n('span',progress.label,'req-work-status '+progress.state),
        n("small","验收重点 · "+req.acceptance),
        n("small",progress.label+" · "+progress.verified+" / "+linked.length+" 工作项已验证"));
      b.addEventListener("click",()=>openRequirement(req,linked,progress));
      return b;
    }));
    const arch=docs.filter(d=>d.category==="architecture"||d.path.includes("ADR-"));
    $("architecture-docs").replaceChildren(...arch.slice(0,12).map(d=>{
      const div=n("div",null,"info");div.append(n("h3",d.title),n("p",d.summary||"阅读技术所有权与决策边界"));
      const foot=n("div",null,"foot");foot.append(n("span",d.path,"docpath"));
      const b=n("button","查看原文 →","link");b.addEventListener("click",()=>openDoc(d.path));foot.append(b);div.append(foot);return div;
    }));
    renderDocs();
  }
  function renderDocs(){
    if(!project)return;
    const q=$("doc-search").value.toLowerCase().trim();
    const matching=project.documents.filter(d=>(d.path+" "+d.title+" "+d.summary).toLowerCase().includes(q));
    $("docs-list").replaceChildren(...matching.map(docButton));
    $("docs-empty").classList.toggle("hide",matching.length>0);
  }
