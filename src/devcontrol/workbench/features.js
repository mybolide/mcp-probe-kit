  async function openFeature(name){
    $("overlay").classList.add("open");$("doc-title").textContent="读取功能记录…";
    $("doc-source").textContent="项目 SQLite · "+name;
    $("doc-content").replaceChildren(n("p","读取中…"));
    try{
      const f=await fetchJSON("/api/features/"+encodeURIComponent(name));
      $("doc-title").textContent=f.name;
      $("doc-source").textContent="版本 "+f.revision+" · "+f.layout+" · "+f.status+" · "+beijingDateTime(f.updatedAt);
      const root=$("doc-content");
      root.replaceChildren();
      const sections=[
        ["产品需求",f.sections.requirements],
        ["技术设计",f.sections.design],
        ["任务拆解",f.sections.tasks],
      ];
      const overview=n("section",null,"spec-block");
      overview.append(n("h3","功能目标"),n("p",f.description),
        n("p","规格版本 "+f.revision+" · "+(f.status==="specified"?
          "规格已校验，但开发仍须完成任务审批":"草案待补全或校验"),"sub"));
      root.append(overview);
      const stats=n("div",null,"feature-summary");
      for(const [title,value] of sections){
        const panel=n("section",null,"spec-block");
        panel.append(n("h3",title),n("p",String(value||"").trim()?"已填写":"待完善","sub"));
        stats.append(panel);
      }
      root.append(stats);
      for(const [title,value] of sections){
        const panel=n("section",null,"spec-block");
        panel.append(n("h3",title));
        const content=n("div",null,"content");
        markdown(content,String(value||"").trim()||"此部分尚未填写。请通过 DevControl feature-save 完善并验证。");
        panel.append(content);root.append(panel);
      }
      // A plan and an unfilled template are not completed specifications.
      // Expose the complete original SQLite data, without summarizing away
      // dependencies, inputs, outputs, evidence or the template deficiencies.
      const steps=Array.isArray(f.plan?.steps)?f.plan.steps:[];
      const draft=f.draft&&typeof f.draft==="object"?f.draft:null;
      const missing=["requirements","design","tasks"].filter(key=>!String(f.sections?.[key]||"").trim());
      if(missing.length||f.status!=="specified"){
        root.prepend(n("p","规格尚未验收："+(missing.length?
          "缺少 "+missing.join(" / ")+"；":"")+
          "草案/模板与执行 Plan 不代表可执行的已批准任务。","spec-warning"));
      }
      const box=(title)=>{
        const panel=n("section",null,"spec-block");panel.append(n("h3",title));root.append(panel);return panel;
      };
      const planBox=box("完整执行 Plan（项目 SQLite 原始数据）");
      if(steps.length){
        for(const step of steps){
          const row=n("details",null,"spec-step");
          row.append(n("summary",String(step.id||"未命名步骤")+" · "+
            String(step.action||step.tool||step.type||"执行步骤")));
          for(const [key,label] of [["dependsOn","前置依赖"],["requiredInputs","所需输入"],
            ["expectedOutputs","预期交付"],["completionEvidence","验收证据"],["note","执行限制"]]){
            const value=step[key];if(value===undefined||value===null)continue;
            row.append(n("p",label+" · "+(Array.isArray(value)?value.join("；"):String(value)),"sub"));
          }
          planBox.append(row);
        }
      }else planBox.append(n("p","尚无可执行步骤；不能推断已完成规划。","sub"));
      const full=n("details");full.append(n("summary","查看完整 Plan 原始数据（包括全局规则与 Gate）"));
      full.append(n("pre",JSON.stringify(f.plan||{},null,2),"spec-raw"));planBox.append(full);
      const templateBox=box("父子规格与草案资料（未审核内容）");
      const subs=Array.isArray(draft?.subspecs)?draft.subspecs:[];
      templateBox.append(n("p",subs.length?
        "子规格草案："+subs.length+" 项（未经过任务审批）":
        "尚未建立父子子规格。当前模板不等于真实需求或设计。","sub"));
      for(const sub of subs){
        const row=n("div",null,"spec-step");
        const details=n("details");
        details.append(n("summary",String(sub.id||"未命名子规格")+" · "+String(sub.title||"")),
          n("pre",JSON.stringify(sub,null,2),"spec-raw"));row.append(details);
        templateBox.append(row);
      }
      if(draft){
        const raw=n("details");
        raw.append(n("summary","查看原始 Spec 草案与模板（包含待填写项）"),
          n("pre",JSON.stringify(draft,null,2),"spec-raw"));
        templateBox.append(raw);
      }
      const exports=n("div",null,"kpirow");
      for(const [fmt,label,ext] of [["markdown","导出 Markdown","md"],["json","导出 JSON","json"]]){
        const a=n("a",label+" ↓","btn");a.href="/api/features/"+encodeURIComponent(name)+"/export?format="+fmt;
        a.download="feature-"+name+"."+ext;a.style.textDecoration="none";exports.append(a);
      }
      root.prepend(exports);
    }catch(e){$("doc-content").replaceChildren(n("p","无法读取功能："+e.message,"error"));}
  }
  function renderFeatures(){
    const rows=features||[];
    $("db-features").replaceChildren(...(rows.length?rows.map(f=>{
      const b=n("button",null,"docitem");b.type="button";
      const linked=featureTaskPlans.find(p=>p.featureName===f.name);
      const planning=linked?.status==="needs_revision"?" · 任务规划待完善":
        linked?.status==="awaiting_second_review"?" · 已拆分 · 待二次 Review":
        linked?.status==="review_pending"?" · 任务待审批":
          linked?.status==="frozen"?" · 已拆分任务":"";
      const related=taskRows().filter(row=>row.item.featureName===f.name);
      const live=related.some(row=>['in_progress','in_review'].includes(row.current?.status));
      const verified=related.filter(row=>row.current?.status==='verified').length;
      const delivery=linked?.status==='frozen'&&related.length&&verified===related.length?
        ' · 任务已完成（产品另行验收）':live?' · 开发中':'';
      b.append(n("span",(f.status==="specified"?"规格已校验":"草稿待完善")+planning+delivery,"taskid"),
        n("b",f.name),n("small","SQLite · "+f.layout+" · 版本 "+f.revision));
      b.addEventListener("click",()=>openFeature(f.name));return b;
    }):[n("div","暂无 SQLite 功能提案；使用 DevControl feature-create 建立需求草稿。","docs-empty")]));
  }
  function preview(doc){
    const b=n("button",null,"previewbtn");
    b.type="button";b.append(n("strong",doc?.title||"尚未建立"),n("small",doc?.path||"无文档"));
    b.addEventListener("click",()=>doc&&openDoc(doc.path));
    if(!doc)b.disabled=true;
    return b;
  }
  function docButton(doc){
    const b=n("button",null,"docitem");b.type="button";
    b.append(n("b",doc.title),n("small",doc.path));b.addEventListener("click",()=>openDoc(doc.path));
    return b;
  }
