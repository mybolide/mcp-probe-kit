/**
 * Zero-dependency browser UI. Data is rendered with textContent, never by
 * interpolating task or agent-provided strings into HTML/DOM markup.
 */
export function boardHtml(nonce: string, embedded = false): string {
  return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>DevControl · 研发看板</title>
<style nonce="${nonce}">
:root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e4efff;background:#09101e}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 20% -15%,#183358 0,transparent 40%),#09101e}
button,input,select{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #67d9ef;outline-offset:2px}
.shell{max-width:1530px;margin:auto;padding:32px clamp(18px,3.4vw,52px) 48px}
.eyebrow{color:#7ce6e9;font-size:11px;font-weight:750;letter-spacing:2px;text-transform:uppercase}
.top{display:flex;align-items:center;justify-content:space-between;gap:20px}
h1{font-size:clamp(27px,3vw,40px);letter-spacing:-1.25px;margin:8px 0 9px;font-weight:750}p{margin:0}
.sub{color:#8297b5;font-size:13px;line-height:1.6}
.live{display:flex;align-items:center;gap:8px;border:1px solid #254a53;background:#10262e;color:#8df0c4;padding:10px 15px;border-radius:50px;font-size:12px;white-space:nowrap}
.dot{height:7px;width:7px;border-radius:50%;background:#62e0b2;box-shadow:0 0 13px #38e5ab}
.bar{margin:25px 0 22px;background:#101b2c;border:1px solid #23334a;border-radius:15px;padding:18px 20px;display:flex;align-items:center;gap:24px;justify-content:space-between;flex-wrap:wrap}
.stats{display:flex;gap:32px;flex-wrap:wrap}.stat strong{font-size:25px;display:block;font-variant-numeric:tabular-nums}.stat span{color:#8296b4;font-size:11px}
.progressbox{flex:1;min-width:170px;max-width:430px}.progressbox small{color:#93a7be;display:flex;justify-content:space-between;margin-bottom:9px}
.progress{height:7px;background:#233348;border-radius:40px;overflow:hidden}.progress>div{height:100%;width:0;background:linear-gradient(90deg,#4c7fe9,#63e6d1);border-radius:40px;transition:width .2s}
.filters{display:flex;gap:10px;margin:0 0 20px;flex-wrap:wrap}
.filters input,.filters select{border:1px solid #2a3b53;border-radius:9px;background:#101b2d;color:#dceafa;padding:11px 13px;min-height:40px}
.filters input{flex:1;min-width:190px}.filters select{min-width:155px}
.refresh{border:1px solid #30556a;color:#aee9ff;background:#102536;border-radius:9px;padding:9px 16px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}
.lane{background:#101a29;border:1px solid #223146;border-radius:15px;min-height:380px;overflow:hidden}
.lanehead{padding:18px;border-bottom:1px solid #1c2b40;display:flex;align-items:center;gap:9px}
.label{font-size:14px;font-weight:740}.count{margin-left:auto;border-radius:20px;background:#24324a;color:#b1c7e4;min-width:30px;text-align:center;padding:3px 9px;font-size:12px}
.stripe{height:3px;background:#5d94e9}.lane:nth-child(2) .stripe{background:#e0b969}.lane:nth-child(3) .stripe{background:#5acda9}
.cards{padding:12px;display:flex;flex-direction:column;gap:11px}.card{background:#172439;color:#e1edfc;border:1px solid #2a3b52;border-radius:11px;padding:16px;text-align:left;width:100%;transition:background .15s,border .15s}
.card:hover{border-color:#5c92c2;background:#1c2d47}.card:focus-visible{outline-offset:-2px}
.cardtop{display:flex;justify-content:space-between;gap:8px;color:#84bde9;font-size:11px;letter-spacing:.4px}
.card h3{font-size:14px;font-weight:650;line-height:1.45;margin:10px 0 14px}.meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:11px;color:#8fa5c0}
.tag{border:1px solid #374862;border-radius:5px;padding:3px 7px}.blocked{color:#efbb8a;border-color:#684a31}.review{color:#ffda86}
.empty{color:#67809e;text-align:center;font-size:13px;padding:56px 15px}
.footer{color:#6d849f;font-size:12px;line-height:1.8;margin-top:20px}
.drawerbg{position:fixed;inset:0;background:#020914aa;display:none;justify-content:flex-end;z-index:10}
.drawerbg.open{display:flex}.drawer{background:#101b2c;border-left:1px solid #34506c;box-shadow:-12px 0 45px #0005;width:min(550px,100%);height:100vh;overflow:auto;padding:28px}
.drawerhead{display:flex;justify-content:space-between;align-items:center}.close{background:#1e324b;color:#dcefff;border:1px solid #33506e;border-radius:8px;padding:8px 12px}
.drawer h2{font-size:23px;line-height:1.4;margin:23px 0}.drawer h4{color:#83e5e6;font-size:12px;letter-spacing:.6px;margin:24px 0 9px}
.detail{color:#c9d6e8;font-size:13px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere}
.details-meta{border-top:1px solid #2b3e56;border-bottom:1px solid #2b3e56;padding:12px 0;display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:12px}
.details-meta small{display:block;color:#7a93b2;margin-bottom:4px}
.notice{margin-top:16px;border-radius:8px;padding:12px;color:#d8bf9c;background:#34291d;font-size:12px;line-height:1.7}
body.embedded{background:transparent}
body.embedded .shell{max-width:none;margin:0;padding:0 2px 18px}
body.embedded .top,body.embedded .footer{display:none}
body.embedded .bar{margin:0 0 19px;background:#121f31}
body.embedded .lane{background:#101b2b}
@media(max-width:850px){.grid{grid-template-columns:1fr}.lane{min-height:140px}.stats{gap:20px}.shell{padding-top:23px}.bar{align-items:stretch}.progressbox{max-width:none}}
</style></head>
<body class="${embedded ? "embedded" : ""}">
<main class="shell">
  <div class="top"><div><div class="eyebrow">DEVCONTROL / PROJECT INTELLIGENCE</div><h1>研发任务看板</h1>
    <p class="sub">任务状态来自 SQLite · 交付记录有 Git 和测试证据 · 不再重复生成过程文档</p></div>
    <div class="live"><span class="dot"></span> 本地只读</div></div>
  <div class="bar"><div class="stats">
    <div class="stat"><strong id="total">—</strong><span>全部任务</span></div>
    <div class="stat"><strong id="completed">—</strong><span>已完成</span></div>
    <div class="stat"><strong id="active">—</strong><span>进行中</span></div>
    <div class="stat"><strong id="pending">—</strong><span>待开发</span></div>
  </div><div class="progressbox"><small><span>已完成比例</span><span id="percent">—</span></small><div class="progress"><div id="progressbar"></div></div></div></div>
  <div class="filters"><input id="search" type="search" placeholder="搜索任务 ID / 标题 / 交付说明…" aria-label="搜索任务">
    <select id="track" aria-label="任务类型筛选"><option value="">全部任务</option><option value="product">产品研发</option><option value="governance">工程治理</option></select>
    <select id="release" aria-label="版本筛选"><option value="">全部版本</option></select>
    <button class="refresh" id="refresh" type="button">刷新看板</button></div>
  <section class="grid" aria-label="Kanban 看板">
    <div class="lane"><div class="stripe"></div><div class="lanehead"><span class="label">待开发</span><span class="count" id="todoCount">0</span></div><div class="cards" id="todo"></div></div>
    <div class="lane"><div class="stripe"></div><div class="lanehead"><span class="label">进行中</span><span class="count" id="inProgressCount">0</span></div><div class="cards" id="inProgress"></div></div>
    <div class="lane"><div class="stripe"></div><div class="lanehead"><span class="label">已完成</span><span class="count" id="doneCount">0</span></div><div class="cards" id="done"></div></div>
  </section>
  <p class="footer" id="updated">读取本地任务数据库中…</p>
</main>
<div class="drawerbg" id="overlay"><aside class="drawer" role="dialog" aria-modal="true" aria-label="任务详情">
  <div class="drawerhead"><span class="eyebrow">TASK DETAIL / TRACEABILITY</span><button class="close" id="close" type="button">关闭 ×</button></div>
  <div id="details"></div></aside></div>
<script nonce="${nonce}">
(() => {
  "use strict";
  const el = id => document.getElementById(id);
  let board = null;
  const labels = {draft:"待审批",ready:"待开发",in_progress:"开发中",in_review:"待验收",verified:"已完成"};
  const beijingDateFormatter=new Intl.DateTimeFormat("zh-CN",{
    timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit",
  });
  const beijingTimeFormatter=new Intl.DateTimeFormat("zh-CN",{
    timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",
  });
  function beijingStamp(value){
    if(value===undefined||value===null||value==="")return "—";
    const text=String(value).trim();
    const normalized=/^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2})?(\\.[0-9]+)?$/.test(text)
      ?text.replace(" ","T")+"Z":text;
    const instant=new Date(normalized);
    return Number.isFinite(instant.getTime())
      ?beijingDateFormatter.format(instant)+" "+beijingTimeFormatter.format(instant)+" 北京时间"
      :text;
  }
  function beijingClock(){
    return beijingTimeFormatter.format(new Date())+" 北京时间";
  }
  function node(tag, text, className) {
    const e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = String(text);
    if (className) e.className = className;
    return e;
  }
  function field(parent, title, value) {
    parent.appendChild(node("h4", title));
    parent.appendChild(node("div", value || "暂无记录", "detail"));
  }
  async function detail(id) {
    el("overlay").classList.add("open");
    el("details").replaceChildren(node("p", "正在加载任务详情…", "sub"));
    try {
      const res = await fetch("/api/tasks/" + encodeURIComponent(id), {cache:"no-store"});
      if (!res.ok) throw Error("任务暂不可用");
      const data = await res.json(), task = data.task;
      const root = el("details");
      root.replaceChildren(node("h2", task.title));
      const summary = node("div", "", "details-meta");
      for (const [key, value] of [["编号",task.id],["状态",labels[task.status] || task.status],
        ["版本",task.release],["父任务",task.parentId || "无"],["优先级",task.priority],
        ["上次更新",beijingStamp(task.updatedAt)]]) {
        const item = node("div");
        item.appendChild(node("small", key)); item.appendChild(node("span", value));
        summary.appendChild(item);
      }
      root.appendChild(summary);
      field(root, "前置依赖", (task.dependsOn || []).join("、") || "无");
      field(root, "子任务", (task.childIds || []).join("、") || "无");
      if(task.spec){
        field(root,"关联需求",task.spec.requirementIds.join("、") || "未明确");
        field(root,"可独立验收的完成条件",task.spec.acceptance || "未明确");
        field(root,"设计来源",task.spec.designRef || "未明确");
        field(root,"正向测试",task.spec.testCases.join("\\n") || "未明确");
        field(root,"失败/边界场景",task.spec.negativeCases.join("\\n") || "未明确");
        field(root,"不在本任务范围",task.spec.outOfScope.join("\\n") || "未明确");
        field(root,"具体交付物",task.spec.deliverables.join("\\n") || "未明确");
        field(root,"预计实施工作量（非完成率）",task.spec.estimatedHours+" 小时");
        field(root,"计划修订版本",String(task.spec.planRevision));
      } else if(task.track==="product"){
        field(root,"规格完整性","历史阶段级任务：尚未绑定独立验收的叶子规格，不得以任务卡数量代表细化程度。");
      }
      const completion = data.completion;
      if (completion) {
        field(root, "完成说明", completion.summary);
        field(root, "实际实现", completion.implementation);
        field(root, "验收结果", completion.verification);
        field(root, "遗留问题", completion.remaining || "无");
        field(root, "提交基线", completion.git_head);
        field(root, "记录版本", "第 " + completion.revision + " 版 · " + beijingStamp(completion.created_at));
      } else root.appendChild(node("div", "当前没有结构化完成报告。历史任务不会自动编造验收说明。", "notice"));
      const refs = (data.evidence || []).map(x => x.kind + ": " + x.reference);
      field(root, "证据索引", refs.join("\\n") || "无");
      field(root, "审计事件", (data.audit || []).slice(-12).map(x =>
        beijingStamp(x.created_at) + " · " + x.event + " · " + x.actor).join("\\n") || "无");
    } catch (error) {
      el("details").replaceChildren(node("p", error.message || "加载失败", "notice"));
    }
  }
  function card(task) {
    const b = node("button", null, "card"); b.type = "button";
    const top = node("div", null, "cardtop");
    top.appendChild(node("span", task.id));
    top.appendChild(node("span", labels[task.status] || task.status));
    b.appendChild(top); b.appendChild(node("h3", task.title));
    const meta = node("div", null, "meta");
    meta.appendChild(node("span", task.release, "tag"));
    if (task.parentId) meta.appendChild(node("span", "↳ " + task.parentId, "tag"));
    if (task.blockedBy.length || task.unverifiedChildren.length) {
      meta.appendChild(node("span", "依赖阻塞", "tag blocked"));
    }
    if (task.status === "in_review") meta.appendChild(node("span", "等待验收", "tag review"));
    b.appendChild(meta);
    if (task.completionSummary) {
      const p = node("p", task.completionSummary, "sub");
      p.style.marginTop = "12px"; b.appendChild(p);
    }
    b.addEventListener("click", () => detail(task.id));
    return b;
  }
  function render() {
    if (!board) return;
    const text = el("search").value.trim().toLowerCase(), release = el("release").value, track=el("track").value;
    for (const key of ["todo", "inProgress", "done"]) {
      const rows = board.columns[key].filter(t => (!release || t.release === release) && (!track || t.track===track) &&
        (!text || [t.id,t.title,t.completionSummary || ""].join(" ").toLowerCase().includes(text)));
      const content = rows.map(card);
      el(key).replaceChildren(...(content.length ? content : [node("div","暂无匹配任务","empty")]));
      el(key + "Count").textContent = String(rows.length);
    }
  }
  async function reload() {
    try {
      const response = await fetch("/api/board", {cache:"no-store"});
      if (!response.ok) throw Error("HTTP " + response.status);
      board = await response.json();
      const {todo,inProgress,done} = board.counts;
      const total = todo + inProgress + done;
      el("total").textContent = String(total);
      el("completed").textContent = String(done);
      el("active").textContent = String(inProgress);
      el("pending").textContent = String(todo);
      const percentage = total ? Math.round(done * 100 / total) : 0;
      el("percent").textContent = percentage + "%";
      el("progressbar").style.width = percentage + "%";
      const prior = el("release").value;
      const releases = [...new Set(Object.values(board.columns).flat().map(t => t.release))].sort();
      el("release").replaceChildren(node("option", "全部版本"));
      el("release").firstElementChild.value = "";
      for (const release of releases) {
        const option = node("option", release); option.value = release; el("release").appendChild(option);
      }
      if (releases.includes(prior)) el("release").value = prior;
      render();
      el("updated").textContent = "上次同步：" + beijingClock() +
        " · 当前建议任务：" + (board.current || "无") +
        " · 本地只读，不允许拖拽改状态（归档任务 " + board.counts.archived + "）";
    } catch (e) {
      el("updated").textContent = "无法读取任务状态：" + String(e.message || e);
    }
  }
  el("search").addEventListener("input", render);
  el("release").addEventListener("change", render);
  el("track").addEventListener("change", render);
  el("refresh").addEventListener("click", reload);
  el("close").addEventListener("click", () => el("overlay").classList.remove("open"));
  el("overlay").addEventListener("click", event => {
    if (event.target === el("overlay")) el("overlay").classList.remove("open");
  });
  window.addEventListener("message",event=>{
    if(event.origin===location.origin&&event.data?.kind==="devcontrol-refresh")reload();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") el("overlay").classList.remove("open");
  });
  reload();
  setInterval(reload, 20000);
})();
</script></body></html>`;
}
