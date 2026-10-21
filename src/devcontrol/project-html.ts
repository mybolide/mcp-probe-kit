/**
 * The DevControl Project Workspace presents canonical project documentation
 * and one simplified task list with three status buckets. Canonical states stay in SQLite.
 */
import { enUi, type WorkbenchLocale } from "./i18n.js";

export function projectHtml(nonce: string, locale: WorkbenchLocale = "zh-CN"): string {
  return String.raw`<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>DevControl · 项目工作台</title>
<style nonce="${nonce}">
:root{--bg:#080e18;--side:#0c1422;--surface:#111c2b;--raised:#152338;--stroke:#27394f;--muted:#8094ae;--text:#e9f1fc;--cyan:#79e4e5;--blue:#669cff;--green:#72e4ba;--warn:#ffcb82;--radius:14px;color-scheme:dark;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
*{box-sizing:border-box}html,body{height:100%;margin:0}body{color:var(--text);background:var(--bg);font-size:14px}
button,input{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.layout{display:grid;grid-template-columns:246px minmax(0,1fr);min-height:100vh}
.sidebar{position:sticky;top:0;height:100vh;background:linear-gradient(180deg,#0e1829 0,#0b1421 70%);border-right:1px solid #233348;padding:26px 15px 18px;display:flex;flex-direction:column}
.brand{display:flex;gap:12px;align-items:center;padding:0 12px 25px}.mark{display:grid;place-items:center;width:39px;height:39px;border-radius:12px;background:linear-gradient(135deg,#256c86,#1e3969);border:1px solid #4384a2;color:#b9fbff;font-size:24px;box-shadow:0 0 24px #126c883b}
.brand strong{display:block;font-size:15px;letter-spacing:-.2px}.brand small{display:block;color:#8497af;font-size:10px;letter-spacing:1.6px;margin-top:4px}
.group-label{color:#587189;font-size:10px;font-weight:800;letter-spacing:1.8px;margin:14px 14px 10px}
.nav{display:flex;flex-direction:column;gap:4px}
.navbtn{display:flex;align-items:center;gap:12px;width:100%;border:1px solid transparent;background:transparent;color:#9caec6;border-radius:10px;text-align:left;padding:12px 13px;font-size:13px;font-weight:580}
.navbtn .symbol{font-size:16px;width:21px;text-align:center;opacity:.9}.navbtn:hover{color:#e5f5ff;background:#1a2a40}
.navbtn.active{color:#d7f9ff;border-color:#30516a;background:linear-gradient(90deg,#1b3850 0%,#14283d 100%);box-shadow:inset 3px 0 0 #69dfe5}
.sidefooter{margin-top:auto;padding:17px 12px 4px;border-top:1px solid #26364b}.sidefooter .status{display:flex;align-items:center;gap:8px;color:#a8e0d8;font-size:12px;margin-bottom:8px}.pulse{width:7px;height:7px;border-radius:50%;background:#5be4be;box-shadow:0 0 11px #5be4be}
.sidefooter p{color:#70859f;font-size:11px;line-height:1.7;margin:0}
.main{min-width:0;max-width:1700px;width:100%;margin:0 auto;padding:30px clamp(24px,3.7vw,62px) 60px;background:radial-gradient(ellipse 50% 280px at 80% 0,#12284091,transparent 75%)}
.bar{display:flex;justify-content:space-between;align-items:center;gap:14px;padding-bottom:23px;margin-bottom:29px;border-bottom:1px solid #203249}
.breadcrumbs{color:#8198b3;font-size:12px;display:flex;gap:10px;align-items:center}.breadcrumbs b{color:#dcecfb;font-weight:550}
.actions{display:flex;align-items:center;gap:9px}.badge{font-size:11px;color:#a3bacd;padding:7px 11px;border-radius:18px;background:#17263a;border:1px solid #2a405a}
.btn{background:#172c43;color:#adeaf2;border:1px solid #305875;border-radius:9px;padding:9px 13px;font-size:12px;font-weight:600}
.btn:hover{background:#203c58}
.view{display:none;animation:appear .12s ease-out}.view.active{display:block}@keyframes appear{from{opacity:.75;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
.eyebrow{color:#73dbe4;letter-spacing:2px;font-size:10px;font-weight:800;text-transform:uppercase}
h1{font-size:clamp(28px,3.5vw,45px);line-height:1.22;letter-spacing:-1.4px;margin:12px 0 12px;font-weight:760}
h2{font-size:20px;letter-spacing:-.5px;margin:0 0 9px}h3{font-size:15px;margin:0 0 9px}
.sub{color:var(--muted);line-height:1.8;font-size:13px;margin:0}.muted{color:var(--muted)}
.hero{position:relative;overflow:hidden;background:linear-gradient(114deg,#112a40,#101d31 60%,#122638);border:1px solid #2e4d66;border-radius:19px;padding:clamp(26px,3.2vw,42px);min-height:236px;margin-bottom:22px}
.hero:before{content:"";position:absolute;inset:auto -60px -180px auto;width:470px;height:470px;border:1px solid #4dadd021;border-radius:50%;box-shadow:0 0 0 45px #399dd00a,0 0 0 110px #399dd009;pointer-events:none}
.hero h1{max-width:760px;margin-bottom:16px}.hero p{position:relative;max-width:800px;color:#a6bfd5;line-height:1.9;font-size:14px;margin:0}
.meta-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:22px;position:relative}.chip{border-radius:7px;border:1px solid #3b5b70;background:#142e43;color:#afdbea;padding:7px 10px;font-size:11px}
.grid{display:grid;gap:17px}.stats{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:22px}.stat{padding:20px 22px;background:#121e2f;border:1px solid #2a3a50;border-radius:13px;min-width:0}.stat strong{display:block;font-size:29px;font-variant-numeric:tabular-nums;font-weight:720;letter-spacing:-1px}.stat span{font-size:11px;color:#8da3bc;display:block;margin-top:7px}
.twocol{grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr)}.panel{background:#121e2e;border:1px solid #283b52;border-radius:15px;padding:25px;min-width:0}
.panelhead{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:17px}.link{background:none;border:none;color:#8ce2f0;padding:5px 0;font-size:12px;font-weight:650;text-align:left}.link:hover{text-decoration:underline}
.priority{background:#1a3044;border:1px solid #315b6a;border-radius:12px;padding:17px}.priority strong{display:block;margin:9px 0 6px;font-size:17px}.priority p{line-height:1.6;color:#a4bed3;font-size:12px;margin:0}.taskid{font-family:ui-monospace,SFMono-Regular,monospace;color:var(--cyan);font-size:11px;letter-spacing:.5px}
.onboardrow{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #283b52}.onboardrow b{font-size:12px}.onboardrow small{display:block;color:#83a3bd;margin-top:4px;line-height:1.65;overflow-wrap:anywhere}.onboardrow .taskid{white-space:nowrap}
.spec-block{border:1px solid #27435a;border-radius:10px;padding:15px;margin:14px 0;background:#0c1b2c}
.spec-block h3{font-size:15px;color:#dceaf7;margin:0 0 12px}.spec-block p{margin:7px 0}
.spec-block .spec-raw{font:12px/1.65 ui-monospace,SFMono-Regular,monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto;color:#9cc6dd;background:#0b1522;padding:14px;border-radius:8px}
.spec-step{border-top:1px solid #29425a;padding:12px 0;overflow-wrap:anywhere}.spec-step strong{color:#d8ebfb}
.spec-key{display:block;font:11px/1.7 ui-monospace,monospace;color:#73c6d1}
.spec-warning{border-left:3px solid #dfa852;padding:12px;background:#2b2630;color:#f3ca87;margin:14px 0}
.task-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:5px;border-radius:11px;background:#102036;border:1px solid #2d435b}
.task-tabs button{border:0;background:transparent;color:#a5b9d0;border-radius:8px;padding:13px 12px;font-weight:650;text-align:center}
.task-tabs button[aria-selected="true"]{color:#e9f8ff;background:#264865;box-shadow:inset 0 -2px #7ee5e8}
.task-tabs .count{font-size:11px;color:#8ea7bd;margin-left:7px}.task-tabs button[aria-selected="true"] .count{color:#aef0f2}
.simple-task-list{display:grid;gap:9px;margin-top:12px}
.simple-task{display:block;width:100%;background:#122034;border:1px solid #2b4057;border-radius:11px;text-align:left;color:inherit;padding:18px 19px;cursor:pointer}
.simple-task:hover{background:#1b3048;border-color:#46758d}
.simple-task:focus-visible{outline:2px solid var(--cyan)}
.simple-task-head{display:flex;align-items:center;justify-content:space-between;gap:14px}
.simple-task-title{font-size:14px;font-weight:650;line-height:1.55;color:#e6f3ff}
.simple-task-meta{font-size:11px;color:#8aa8be;margin-top:5px}
.simple-task-summary{font-size:12px;color:#adc4d8;line-height:1.6;margin-top:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.simple-task .issue-state{flex:none;font-size:11px}
.issue-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:15px 0}
.issue-controls input,.issue-controls select{border:1px solid #36516b;background:#102034;color:#deebf7;border-radius:8px;padding:10px 12px;min-height:40px}
.issue-controls input{min-width:190px;flex:1}
.issue-controls select{max-width:180px}
.issue-state{display:inline-block;padding:4px 8px;border-radius:5px;white-space:nowrap;background:#263c54;color:#c4d8ee}
.issue-state.pending{background:#4a3723;color:#fad296}
.issue-state.done{background:#1d503e;color:#9de9c5}
.issue-state.blocked{background:#493027;color:#ffbaaa}
.issue-count{font-size:12px;color:#a7bed6;padding:9px 2px}
.issue-details{display:grid;gap:10px}
.issue-details section{padding:14px;border:1px solid #2c4660;border-radius:8px;background:#12233a}
.issue-details h3{margin:0 0 9px;font-size:13px;color:#84dce5}
.issue-details p{margin:7px 0;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
.flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.flowitem{background:#17273b;border:1px solid #2f435b;border-radius:10px;padding:16px}.flowitem b{display:block;margin:14px 0 7px;font-size:13px}.flowitem p{margin:0;color:#819bb8;font-size:11px;line-height:1.6}.flownum{font-size:11px;color:#81dbe6;font-family:ui-monospace,monospace}
.preview{display:grid;gap:9px}.previewbtn{display:block;border:1px solid #304259;border-radius:10px;background:#19283b;padding:15px;text-align:left;width:100%;color:var(--text)}.previewbtn:hover{border-color:#60a5bb;background:#20344c}.previewbtn strong{display:block;font-size:13px}.previewbtn small{display:block;font-size:11px;color:#849bb7;margin-top:7px}
.sectionhead{margin-bottom:24px}.sectionhead h1{margin-bottom:11px}
.widebox{background:linear-gradient(125deg,#132638,#142033);border:1px solid #304861;border-radius:15px;padding:28px;margin-bottom:20px}.widebox .body{font-size:14px;line-height:1.85;color:#b8cee4;max-width:1000px}
.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.info{background:#121e2e;border:1px solid #2a3d52;border-radius:13px;padding:23px;min-width:0}.info h3{line-height:1.5}.info p{color:#91a8c1;font-size:12px;line-height:1.85;min-height:44px}.info .docpath{font:11px ui-monospace,monospace;color:#5f87a7;overflow-wrap:anywhere}
.info .foot{display:flex;justify-content:space-between;align-items:center;margin-top:17px}
.mini{font-size:11px;color:#9acde2;border:1px solid #34516b;border-radius:6px;padding:5px 9px;background:#1b324a}
.documentbar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}.search{width:100%;max-width:500px;border:1px solid #36516b;border-radius:10px;background:#122135;padding:12px 14px;color:#e6f4ff;outline:none}
.doclist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.docitem{border:1px solid #304257;border-radius:11px;background:#142237;color:#e7f0fc;text-align:left;padding:16px;min-width:0}.docitem:hover{background:#1d3047;border-color:#60a7ca}
.docitem b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.docitem small{font:10px ui-monospace,monospace;color:#83a3be;display:block;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.docs-empty{color:#99b0c4;padding:34px;border:1px dashed #2d4057;border-radius:12px}
.overlay{position:fixed;inset:0;background:#020913c9;display:none;align-items:stretch;justify-content:flex-end;z-index:30}.overlay.open{display:flex}
.drawer{width:min(860px,100%);background:#0d1726;border-left:1px solid #385272;box-shadow:-16px 0 65px #0008;overflow-y:auto;padding:30px clamp(20px,3vw,38px);height:100vh}
.drawerhead{display:flex;justify-content:space-between;align-items:center;gap:12px}.drawer h2{font-size:25px;margin:25px 0 8px}
.source{font:11px ui-monospace,monospace;color:#76b5d6;overflow-wrap:anywhere;margin-bottom:25px}
.content{line-height:1.86;font-size:13px;color:#bfd0e5;overflow-wrap:anywhere}
.content h1,.content h2,.content h3{margin:27px 0 12px;color:#e8f4ff;letter-spacing:0;font-size:19px}
.content h1{font-size:25px}.content h3{font-size:15px}.content p{margin:10px 0}.content pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #294764;background:#071223;color:#abd0df;padding:16px;border-radius:8px;font:12px/1.6 ui-monospace,monospace}
.content ul{padding-left:21px}.content li{margin-bottom:6px}.content blockquote{border-left:3px solid #5a9fae;margin-left:0;padding:5px 16px;color:#8ab7c8;background:#142539}
.content .md-table-scroll{max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;margin:16px 0;border:1px solid #2c4963;border-radius:9px}
.content .md-table{border-collapse:collapse;width:100%;min-width:max-content;line-height:1.6}
.content .md-table th,.content .md-table td{border:1px solid #2c4963;padding:11px 14px;min-width:115px;max-width:340px;overflow-wrap:anywhere;white-space:normal;vertical-align:top}
.content .md-table th{background:#18314b;color:#e1f4ff;font-weight:700}
.content .md-table tbody tr:nth-child(even){background:#132439}
.content .md-table tbody tr:hover{background:#1b3249}
.hide{display:none!important}.error{color:#ffcb99;font-size:12px}.kpirow{display:flex;gap:14px;flex-wrap:wrap;margin:16px 0}.kpi{background:#1b3044;border:1px solid #2e526c;border-radius:10px;padding:15px;min-width:140px}.kpi b{display:block;font-size:25px}.kpi span{font-size:11px;color:#9bb6cf}
@media(max-width:1050px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.twocol{grid-template-columns:1fr}}
@media(max-width:760px){.layout{grid-template-columns:1fr}.sidebar{position:static;height:auto;padding:12px;display:block}.brand{padding:5px 8px 10px}.nav{flex-direction:row;overflow-x:auto;padding:0 3px 5px}.navbtn{width:auto;white-space:nowrap;padding:9px 11px}.group-label,.sidefooter{display:none}.main{padding:22px 15px 40px}.bar{flex-wrap:wrap}.hero{min-height:0}.flow{grid-template-columns:repeat(2,minmax(0,1fr))}.cards,.doclist{grid-template-columns:1fr}.taskframe{min-height:1000px}.stats{gap:9px}.stat{padding:15px}.stat strong{font-size:23px}}
</style></head>
<body><div class="layout">
<aside class="sidebar">
  <div class="brand"><div class="mark">◇</div><div><strong>DevControl</strong><small>研发工作台</small></div></div>
  <div class="group-label">项目工作台</div>
  <nav class="nav" aria-label="研发工作台导航">
    <button type="button" class="navbtn active" data-view="overview"><span class="symbol">◈</span>项目总览</button>
    <button type="button" class="navbtn" data-view="product"><span class="symbol">◎</span>产品与目标</button>
    <button type="button" class="navbtn" data-view="requirements"><span class="symbol">☰</span>需求管理</button>
    <button type="button" class="navbtn" data-view="architecture"><span class="symbol">⌘</span>技术架构</button>
    <button type="button" class="navbtn" data-view="tasks"><span class="symbol">▤</span>任务与进度</button>
    <button type="button" class="navbtn" data-view="issues"><span class="symbol">⚑</span>Bug 与架构变更</button>
    <button type="button" class="navbtn" data-view="history"><span class="symbol">◷</span>项目历史会话</button>
    <button type="button" class="navbtn" data-view="docs"><span class="symbol">▣</span>文档中心</button>
  </nav>
  <div class="sidefooter"><div class="status"><span class="pulse"></span>本地工作台</div>
    <p>单一事实来源<br>产品 / 架构 / 任务 / 证据同步呈现</p></div>
</aside>
<main class="main">
  <header class="bar"><div class="breadcrumbs"><span id="projectcrumb">项目</span><span>/</span><b id="crumb">总览</b></div>
  <div class="actions"><span class="badge" id="branch">Git · 读取中</span>
    <button class="btn" id="share-lan" type="button">局域网连接</button>
    <button class="btn" id="reload" type="button">↻ 同步信息</button></div></header>
  <section id="view-overview" class="view active">
    <div class="hero"><div class="eyebrow">项目概览</div>
      <h1>了解项目，更清楚下一步</h1><p id="project-intro">正在读取项目愿景与开发规范…</p>
      <div class="meta-row"><span class="chip" id="projectname">PROJECT</span><span class="chip" id="projectstate">读取源文档</span><span class="chip" id="governance-count">工程治理 · —</span><span class="chip">任务进度来自 SQLite</span></div>
    </div>
    <section class="panel hide" id="onboarding-panel" style="margin-top:18px" aria-label="项目接入状态">
      <div class="panelhead"><h2 id="onboarding-title">项目接入</h2><span class="eyebrow">接入检查</span></div>
      <p class="sub" id="onboarding-next"></p>
      <div id="onboarding-steps" style="margin-top:15px"></div>
    </section>
    <div class="grid stats">
      <div class="stat"><strong id="s-total">—</strong><span>任务总数（含待审核）</span></div><div class="stat"><strong id="s-done">—</strong><span>已完成</span></div>
      <div class="stat"><strong id="s-active">—</strong><span>开发中</span></div><div class="stat"><strong id="s-pending">—</strong><span>未开始（含待审核）</span></div>
    </div>
    <div class="grid twocol">
      <section class="panel"><div class="panelhead"><h2>当前研发焦点</h2><button class="link" data-go="tasks">查看任务 →</button></div>
        <div class="priority"><span class="taskid" id="next-id">当前任务</span><strong id="next-title">读取下一任务…</strong><p id="next-detail">由任务依赖与验收状态决定，不随聊天内容任意跳步。</p></div>
      </section>
      <section class="panel"><div class="panelhead"><h2>新人快速上手</h2><span class="eyebrow">入门指引</span></div>
        <div class="preview" id="quickdocs"><p class="sub">正在读取规范性文件索引…</p></div></section>
    </div>
    <section class="panel" style="margin-top:18px"><div class="panelhead"><h2>从需求到可验证交付</h2><span class="eyebrow">研发流程</span></div>
      <div class="flow"><div class="flowitem"><span class="flownum">01 / DEFINE</span><b>产品目标</b><p>愿景、OKR、需求定义要解决的问题</p></div>
      <div class="flowitem"><span class="flownum">02 / DESIGN</span><b>架构与规格</b><p>模块所有权、ADR、功能 Spec</p></div>
      <div class="flowitem"><span class="flownum">03 / EXECUTE</span><b>任务与计划</b><p>父子任务、依赖、Agent 执行</p></div>
      <div class="flowitem"><span class="flownum">04 / VERIFY</span><b>质量与追溯</b><p>真实提交、验收证据和 SQLite 结果</p></div></div>
    </section>
  </section>
  <section id="view-product" class="view">
    <div class="sectionhead"><div class="eyebrow">产品愿景</div><h1>产品定位与阶段目标</h1><p class="sub">从原始愿景与路线图读取，不产生重复的项目介绍文件。</p></div>
    <div class="widebox"><div class="eyebrow">项目使命</div><h2 id="vision-title" style="margin-top:14px">产品愿景</h2><p class="body" id="vision-summary">读取中…</p><button class="link" id="open-vision" type="button">阅读完整产品愿景 →</button></div>
    <div class="cards">
      <div class="info"><div class="eyebrow">版本规划</div><h3 style="margin-top:12px" id="roadmap-title">版本路线图</h3><p id="roadmap-summary">读取中…</p><div class="foot"><span class="docpath" id="roadmap-source"></span><button class="link" id="open-roadmap">查看版本路线 →</button></div></div>
      <div class="info"><div class="eyebrow">阶段目标</div><h3 style="margin-top:12px" id="okr-title">阶段目标与原则</h3><p id="okr-summary">读取中…</p><div class="foot"><span class="docpath" id="okr-source">docs/okr/</span><button class="link" id="open-okr">查看阶段目标 →</button></div></div>
    </div>
  </section>
  <section id="view-requirements" class="view">
    <div class="sectionhead"><div class="eyebrow">需求范围</div><h1>需求与功能边界</h1><p class="sub">每个功能编号在需求文档中定义，关联规格与任务；此处只读原始需求。</p></div>
    <div class="widebox"><h2 id="requirements-title">产品需求</h2><p class="body">下面的数量由需求文档中实际 FR/NFR 编号去重计算，不是完成比例。</p>
      <div class="kpirow"><div class="kpi"><b id="fr-count">—</b><span>功能需求 FR</span></div><div class="kpi"><b id="nfr-count">—</b><span>非功能需求 NFR</span></div></div>
      <button class="link" id="open-requirements">查看完整产品需求 →</button></div>
    <div class="panel" style="margin-bottom:18px"><div class="panelhead"><h2>功能需求清单</h2><button class="link" data-doc="docs/product/requirements.md">查看完整 PRD →</button></div>
      <div class="doclist" id="requirement-list"></div></div>
    <div class="panel" style="margin-bottom:18px"><div class="panelhead"><h2>功能提案与规格</h2><span class="eyebrow">数据库记录</span></div>
      <p class="sub" style="margin-bottom:18px">start_feature 直接记录在当前项目数据库；点击阅读，按需导出 Markdown 或 JSON，不默认创建重复文档。</p>
      <div class="doclist" id="db-features"></div></div>
    <div class="panel"><div class="panelhead"><h2>既有 Git 功能规格</h2><button class="link" data-go="docs">全部文档 →</button></div><div class="doclist" id="specdocs"></div></div>
  </section>
  <section id="view-architecture" class="view">
    <div class="sectionhead"><div class="eyebrow">架构与职责</div><h1>系统架构与工程边界</h1><p class="sub">新人从这里理解组件、所有权以及重要技术决策。</p></div>
    <div class="widebox"><h2 id="architecture-title">总体架构</h2><p class="body" id="architecture-summary">读取中…</p>
      <pre id="architecture-diagram" class="hide" style="white-space:pre;max-width:100%;overflow-x:auto;font:12px/1.5 ui-monospace,monospace;background:#0a1929;border:1px solid #2a4e68;border-radius:10px;color:#b4def0;padding:18px;margin:18px 0"></pre>
      <button class="link" id="open-architecture">查看完整架构说明 →</button></div>
    <div class="cards" id="architecture-docs"></div>
  </section>
  <section id="view-tasks" class="view">
    <div class="sectionhead"><div class="eyebrow">任务管理</div><h1>任务列表</h1>
      <p class="sub">按实际任务状态查看进度；待审核任务归入未开始，不等于获准开发。</p></div>
    <div class="task-tabs" role="tablist" aria-label="任务状态">
      <button type="button" role="tab" data-tasktab="not_started" aria-selected="true" aria-controls="task-list-panel">未开始 <span id="count-not_started" class="count">0</span></button>
      <button type="button" role="tab" data-tasktab="in_progress" aria-selected="false" aria-controls="task-list-panel">开发中 <span id="count-in_progress" class="count">0</span></button>
      <button type="button" role="tab" data-tasktab="completed" aria-selected="false" aria-controls="task-list-panel">已完成 <span id="count-completed" class="count">0</span></button>
    </div>
    <div id="task-list-panel" role="tabpanel" aria-label="当前状态的任务">
      <div class="issue-controls"><input id="task-search" type="search" placeholder="搜索任务…" aria-label="搜索任务"></div>
      <p class="issue-count" id="task-list-count">正在读取任务…</p>
      <div id="task-rows" class="simple-task-list" aria-live="polite"></div>
    </div>
  </section>
  <section id="view-issues" class="view">
    <div class="sectionhead"><div class="eyebrow">缺陷与变更</div><h1>缺陷与架构变更</h1>
      <p class="sub">项目本地 SQLite 中的缺陷和影响架构的设计变更。相同条目去重，顶层设计必须随变更审核。</p></div>
    <div class="doclist" id="issues-list"></div>
  </section>
  <section id="view-history" class="view">
    <div class="sectionhead"><div class="eyebrow">项目记录</div><h1>项目历史会话</h1>
      <p class="sub">直接读取 mcp-probe-kit 的 History Session；支持搜索、读取原始检查点与跨会话恢复。它不是 Qdrant 共享记忆。</p></div>
    <div class="documentbar"><input class="search" id="history-search" type="search"
      placeholder="搜索决策、上下文、问题、历史开发记录…" aria-label="搜索项目历史会话">
      <button class="btn" id="history-refresh">检索历史</button></div>
    <div class="doclist" id="history-list"></div>
    <div class="docs-empty hide" id="history-empty">没有匹配的项目历史会话。</div>
  </section>
  <section id="view-docs" class="view">
    <div class="sectionhead"><div class="eyebrow">项目文档</div><h1>项目文档中心</h1><p class="sub">Git 文档是规范事实源；任务状态、完成说明则在 SQLite，避免重复维护。</p></div>
    <div class="documentbar"><input id="doc-search" class="search" type="search" placeholder="搜索产品、架构、需求、ADR、Spec…" aria-label="搜索文档"></div>
    <div id="docs-list" class="doclist"></div><div class="docs-empty hide" id="docs-empty">没有匹配的文档，或项目尚未建立规范索引。</div>
  </section>
  <footer style="padding-top:25px;margin-top:20px;border-top:1px solid #203249;color:#6e829b;font-size:11px">
    DevControl 项目工作台 · 数据取自当前 Git 项目与本地任务数据库 · <span id="synced">等待同步</span>
  </footer>
</main></div>
<div id="overlay" class="overlay" role="presentation"><aside class="drawer" role="dialog" aria-modal="true" aria-label="项目文档">
  <div class="drawerhead"><span class="eyebrow">任务详情 / 原始依据</span><button id="close" class="btn" type="button">关闭 ×</button></div>
  <h2 id="doc-title">文档</h2><div class="source" id="doc-source"></div><div id="doc-content" class="content"></div>
</aside></div>
<script nonce="${nonce}">
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const locale=${JSON.stringify(locale)};
  const languagePack=${JSON.stringify(enUi)};
  const translate=(value)=>locale==="en" ? (languagePack[value]||value) : value;
  function localizeChrome(){
    if(locale!=="en")return;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    const candidates=[];let node;
    while((node=walker.nextNode())){
      const parent=node.parentElement;
      if(parent&&["SCRIPT","STYLE","PRE","CODE"].includes(parent.tagName))continue;
      if(languagePack[node.nodeValue?.trim()||""])candidates.push(node);
    }
    for(const item of candidates){
      const value=item.nodeValue||"",key=value.trim();
      item.nodeValue=value.replace(key,languagePack[key]);
    }
    for(const item of document.querySelectorAll("[placeholder]")){
      const current=item.getAttribute("placeholder");
      if(current&&languagePack[current])item.setAttribute("placeholder",languagePack[current]);
    }
    document.title="DevControl · Project workspace";
  }
  let project=null,board=null,features=[],onboarding=null,releasePlan=null,taskTab="not_started";
  const titles={overview:"总览",product:"产品与目标",requirements:"需求管理",architecture:"技术架构",tasks:"任务进度",issues:"Bug 与变更",history:"历史会话",docs:"文档中心"};
  const n=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined&&text!==null)x.textContent=translate(String(text));if(cls)x.className=cls;return x;};
  const fetchJSON=async url=>{const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return r.json();};
  function go(view){
    if(!titles[view])return;
    document.querySelectorAll(".navbtn").forEach(e=>e.classList.toggle("active",e.dataset.view===view));
    document.querySelectorAll(".view").forEach(e=>e.classList.toggle("active",e.id==="view-"+view));
    $("crumb").textContent=translate(titles[view]);
    history.replaceState(null,"","#"+view);
    if(view==="history")loadHistory();
    if(view==="issues")loadIssues();
  }
  function taskPlanNodes(){
    const scope=releasePlan?.status==="review_pending"?
      releasePlan?.proposal:releasePlan?.frozen;
    return Array.isArray(scope?.nodes)?scope.nodes:[];
  }
  function taskRows(){
    const nodes=taskPlanNodes();
    const real=Object.values(board?.columns||{}).flat().filter(t=>t.track==="product");
    const byId=new Map(real.map(t=>[t.id,t]));
    const byParent=new Map();
    nodes.forEach(node=>{
      const p=node.parentId||"";
      if(!byParent.has(p))byParent.set(p,[]);
      byParent.get(p).push(node);
    });
    const result=[],seen=new Set();
    const add=(item,depth=0,stage="")=>{
      if(seen.has(item.id))return;seen.add(item.id);
      const current=byId.get(item.id);
      const phase=stage||item.id;
      const pending=releasePlan?.status==="review_pending"&&!item.existing;
      const status=pending?"pending":current?.status||"unplanned";
      // Planning stages are dependency containers, not user-facing tasks.
      if(item.kind!=="group")result.push({item,current,depth,phase,status,pending});
      (byParent.get(item.id)||[]).forEach(child=>add(child,depth+1,phase));
    };
    (byParent.get("")||[]).forEach(item=>add(item));
    // Do not hide real tasks missing from the proposed plan.
    real.filter(item=>!seen.has(item.id) && item.status!=="cancelled").forEach(item=>{
      result.push({item:{...item,kind:"leaf",dependsOn:item.dependsOn||[],
        requirementIds:item.spec?.requirementIds||[],
        acceptance:item.spec?.acceptance||""},current:item,
        depth:0,phase:item.parentId||item.id,status:item.status,pending:false});
    });
    return result;
  }
  function taskStatus(row){
    const s=row.status;
    if(s==="pending")return ["待审核","pending"];
    if(s==="verified")return ["已完成","done"];
    if(s==="in_progress")return ["开发中",""];
    if(s==="in_review")return ["等待验收",""];
    if(s==="ready"||s==="draft")return ["未开始",""];
    return ["未开始","blocked"];
  }
  function taskBucket(row){
    if(row.status==="cancelled")return null;
    if(row.status==="verified")return "completed";
    if(row.status==="in_progress"||row.status==="in_review")return "in_progress";
    // Not-yet-approved plans must not be counted as in development.
    return "not_started";
  }
  function displayTaskTitle(task){
    // Historical task IDs/titles in SQLite must remain unchanged.
    const historical={"F0":"基础环境与架构","F1":"最小事件与接口契约"};
    return historical[task.id]||task.title;
  }
  function setTaskTab(tab){
    if(!["not_started","in_progress","completed"].includes(tab))return;
    taskTab=tab;
    for(const b of document.querySelectorAll("[data-tasktab]"))
      b.setAttribute("aria-selected",String(b.dataset.tasktab===tab));
    renderTaskList();
  }
  function openPlanTask(row){
    $("overlay").classList.add("open");
    const task=row.item,actual=row.current,status=taskStatus(row)[0];
    $("doc-title").textContent=task.id+" · "+displayTaskTitle(task);
    const releaseName=String(releasePlan?.release||actual?.release||"");
    $("doc-source").textContent=(row.pending?
      (locale==="en"?"SQLite proposal pending approval · cannot execute":"SQLite 待审提案，未批准执行"):
      (locale==="en"?"Approved task ledger":"已存在任务台账"));
    $("doc-source").textContent=releaseName+" · "+$("doc-source").textContent+" · "+translate(status);
    const body=$("doc-content");body.replaceChildren();
    const content=n("div",null,"issue-details");body.append(content);
    const section=(heading,value)=>{
      const box=n("section");
      box.append(n("h3",heading));
      if(Array.isArray(value)){
        if(value.length)for(const v of value)box.append(n("p","• "+String(v)));
        else box.append(n("p","未明确"));
      }else box.append(n("p",value===null||value===undefined||value===""?"未明确":String(value)));
      content.append(box);return box;
    };
    section("当前状态与执行边界",row.pending?
      "规划待审核 · 不可领取、执行或计入版本完成率。":
      "状态："+status+"。执行以真实 SQLite 状态、依赖和 Gate 为准。");
    section("负责人 / 计划完成",[
      translate("负责人")+": "+(actual?.owner||translate("未分配")),
      (locale==="en"?"Assignment evidence: ":"分配依据：")+
        (actual?.ownerAssignment?.decisionRef||(locale==="en"?"Not assigned by reviewer":"尚无正式分配决定")),
      locale==="en"?"Target date: Unscheduled (not inferred from Git commit timestamps)":
        "计划完成时间：未排期（不从 Git 提交时间推断）",
    ]);
    if(!actual?.owner){
      const hint=section(locale==="en"?"Git contributors — suggestions, not assignees":
        "Git 参与者建议（不是自动负责人）",
        locale==="en"?"Loading historical authors; a reviewer must explicitly assign responsibility.":
          "读取 Git 历史作者；仍须由审核人明确分配负责人。");
      fetchJSON("/api/contributors").then(data=>{
        if(!$("doc-title").textContent.startsWith(task.id+" · "))return;
        const people=(data.contributors||[]).slice(0,8);
        hint.replaceChildren(n("h3",locale==="en"?"Historical Git contributors (not assigned)":
          "Git 历史参与者（未分配）"));
        if(people.length)for(const person of people)
          hint.append(n("p",person.name+" · "+person.count+
            (locale==="en"?" past commits":" 次历史提交")));
        else hint.append(n("p",locale==="en"?"No contributor history available.":
          "尚无可读取的 Git 提交作者。"));
        hint.append(n("p",locale==="en"?
          "Responsibility is assigned only with a reviewed MCP assignment decision.":
          "只有经过审核、记录决定依据的 MCP 任务分配，才会成为正式负责人。"));
      }).catch(()=>{});
    }
    section("需求来源",task.requirementIds||actual?.spec?.requirementIds||[]);
    section("使用场景 / 触发条件 / 用户期望",task.scenario||"尚无独立业务场景说明");
    section("按顺序执行的业务与系统流程",task.workflow||[]);
    section("业务规则与不可变约束",task.businessRules||[]);
    section("具体工作与完成条件",task.acceptance||actual?.spec?.acceptance||"缺少经审核的详细规格");
    section("技术方案与约束",task.designRef||actual?.spec?.designRef||"无设计链接");
    section("原始需求、Spec 与测试用例依据",task.sourceRefs||[]);
    section("已确认决策、限制和审查备注",task.reviewNotes||[]);
    section("待确认问题与阻塞决策",task.openQuestions||[]);
    section("正向测试",task.testCases||actual?.spec?.testCases||[]);
    section("异常 / 边界场景",task.negativeCases||actual?.spec?.negativeCases||[]);
    section("交付验收应保留的真实证据",task.verificationEvidence||[]);
    section("不在本任务范围",task.outOfScope||actual?.spec?.outOfScope||[]);
    section("交付文件 / 产物",task.deliverables||actual?.spec?.deliverables||[]);
    section("依赖、阶段与允许变更",[
      "所属阶段："+row.phase,"父任务："+(task.parentId||"无"),
      "前置依赖："+((task.dependsOn||actual?.dependsOn||[]).join("、")||"无"),
      "允许路径："+((task.allowedPaths||actual?.allowedPaths||[]).join("；")||"未明确"),
      "验收 Gate："+((task.requiredGates||actual?.requiredGates||[]).join("、")||"尚未配置"),
    ]);
    if(actual){
      const btn=n("button","查看正式任务的 Git、测试和审计证据 →","btn");
      btn.type="button";content.append(btn);
      btn.addEventListener("click",async()=>{
        btn.disabled=true;btn.textContent="读取正式交付证据…";
        try{
          const data=await fetchJSON("/api/tasks/"+encodeURIComponent(actual.id));
          section("执行和完成说明",data.completion?
            [data.completion.summary,data.completion.implementation,data.completion.verification,
              "遗留问题："+(data.completion.remaining||"无")]:
            "尚无经提交的完整交付说明");
          section("提交及审计证据",(data.evidence||[]).map(v=>v.kind+" · "+v.reference));
        }catch(e){section("执行证据读取失败",e.message);}
        btn.remove();
      });
    }
    if(row.pending)section("规格缺口与审核提示",[
      ...(!task.scenario?["缺少用户或系统触发条件及成功输出。"]:[]),
      ...((task.workflow||[]).length<3?["缺少端到端步骤与状态转换。"]:[]),
      ...((task.testCases||[]).length<=1?["正向测试场景不足，需要按相关 Spec 核验边界覆盖。"]:[]),
      ...((task.negativeCases||[]).length<=1?["反例目前只有一条，不能代表所有失败与异常分支。"]:[]),
      "负责人未分配、排期未确认；不应仅凭标题、预计工时和单条验收文字批准开发。",
    ]);
  }
  function renderTaskList(){
    const rows=taskRows().filter(row=>taskBucket(row)!==null);
    for(const bucket of ["not_started","in_progress","completed"]){
      $("count-"+bucket).textContent=String(rows.filter(row=>taskBucket(row)===bucket).length);
    }
    const search=$("task-search").value.trim().toLowerCase();
    const filtered=rows.filter(row=>{
      if(taskBucket(row)!==taskTab)return false;
      const data=row.item;
      return !search||[data.id,displayTaskTitle(data),data.scenario,data.acceptance,(data.requirementIds||[]).join(" "),
        (data.negativeCases||[]).join(" "),(data.deliverables||[]).join(" ")].join(" ").toLowerCase().includes(search);
    });
    $("task-rows").replaceChildren(...(filtered.length?filtered.map(row=>{
      const task=row.item;
      const button=n("button",null,"simple-task");button.type="button";
      const head=n("div",null,"simple-task-head");
      head.append(n("span",displayTaskTitle(task),"simple-task-title"));
      const [label,cls]=taskStatus(row);
      if(row.pending||row.status==="in_review"){
        head.append(n("span",label,"issue-state "+cls));
      }
      button.append(head,n("div",task.id+" · "+row.phase+" · "+translate("负责人")+": "+
        (row.current?.owner||translate("未分配")),"simple-task-meta"));
      const scenario=task.scenario||task.acceptance||row.current?.spec?.acceptance||"尚无任务说明";
      button.append(n("div",scenario,"simple-task-summary"));
      button.addEventListener("click",()=>openPlanTask(row));
      return button;
    }):[n("div",search?"没有匹配的任务。":"当前没有任务。","docs-empty")]));
    const pending=rows.filter(row=>row.pending&&taskBucket(row)===taskTab).length;
    $("task-list-count").textContent=locale==="en"?
      ("Showing "+filtered.length+" tasks"+(pending?" · "+pending+" pending review (not authorized to implement)":"")):
      ("显示 "+filtered.length+" 项"+(pending?" · 其中 "+pending+" 项待审核（尚未允许开发）":""));
  }
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
  async function loadIssues(){
    const container=$("issues-list");
    try{
      const data=await fetchJSON("/api/work-items");
      container.replaceChildren(...(data.items.length?data.items.map(item=>{
        const b=n("button",null,"docitem");b.type="button";
        b.append(n("span",item.kind==="bug"?"BUG":item.status==="synced"?"已同步顶层设计":"待同步顶层设计","taskid"),
          n("b",item.title),n("small",item.creator+" · "+item.device+" · "+(item.topLevelDocument||item.id)));
        b.addEventListener("click",()=>{
          $("overlay").classList.add("open");
          $("doc-title").textContent=item.title;
          $("doc-source").textContent=item.id+" · "+item.status;
          markdown($("doc-content"),[
            "# 条目内容",item.description,
            "# 来源",item.sourceRef||"未填写",
            "# 对应功能",item.featureName||"未关联",
            "# 顶层架构",item.topLevelDocument||"不适用",
            "# 创建者与设备",item.creator+" / "+item.device,
          ].join("\n\n"));
        });return b;
      }):[n("div","当前项目尚无 Bug 或待审架构变更。","docs-empty")]));
    }catch(e){container.replaceChildren(n("div","读取失败："+e.message,"error"));}
  }
  async function loadHistory(){
    const container=$("history-list");
    try{
      const q=$("history-search").value.trim();
      const data=await fetchJSON("/api/history?q="+encodeURIComponent(q)+"&limit=30");
      container.replaceChildren(...(data.results.length?data.results.map(hit=>{
        const b=n("button",null,"docitem");b.type="button";
        b.append(n("span","SESSION #"+hit.number,"taskid"),n("b",hit.title),
          n("small",hit.path+" · "+(hit.updated_at||"") ));
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
  async function openFeature(name){
    $("overlay").classList.add("open");$("doc-title").textContent="读取功能记录…";
    $("doc-source").textContent="项目 SQLite · "+name;
    $("doc-content").replaceChildren(n("p","读取中…"));
    try{
      const f=await fetchJSON("/api/features/"+encodeURIComponent(name));
      $("doc-title").textContent=f.name;
      $("doc-source").textContent="版本 "+f.revision+" · "+f.layout+" · "+f.status+" · "+f.updatedAt;
      const root=$("doc-content");
      const text=["# 功能目标",f.description,
        "# 需求",f.sections.requirements||"尚未完善（草稿）",
        "# 技术设计",f.sections.design||"尚未完善（草稿）",
        "# 研发任务",f.sections.tasks||"尚未完善（草稿）"].join("\n\n");
      markdown(root,text);
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
          const row=n("div",null,"spec-step");
          row.append(n("strong",String(step.id||"未命名步骤")+" · "+
            String(step.action||step.tool||step.type||"执行步骤")));
          for(const [key,label] of [["dependsOn","前置依赖"],["requiredInputs","所需输入"],
            ["expectedOutputs","预期交付"],["completionEvidence","验收证据"],["note","执行限制"]]){
            const value=step[key];if(value===undefined||value===null)continue;
            row.append(n("span",label+": "+(Array.isArray(value)?value.join("；"):String(value)),"spec-key"));
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
        row.append(n("strong",String(sub.id||"未命名子规格")+" · "+String(sub.title||"")),
          n("pre",JSON.stringify(sub,null,2),"spec-raw"));
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
      b.append(n("span",f.status==="specified"?"规格已校验":"草稿待完善","taskid"),
        n("b",f.name),n("small","SQLite · "+f.layout+" · 版本 "+f.revision));
      b.addEventListener("click",()=>openFeature(f.name));return b;
    }):[n("div","暂无 SQLite 功能提案；首次调用 start_feature 后自动显示。","docs-empty")]));
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
  function strip(s){return s.replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/[*_]/g,"").replace(new RegExp(String.fromCharCode(96),"g"),"").trim();}
  // GFM-style pipe cells; a pipe escaped with a backslash or inside an inline
  // code span belongs to the cell, rather than creating a new column.
  function tableCells(line){
    let raw=line.trim();
    if(!raw.includes("|"))return null;
    if(raw.startsWith("|"))raw=raw.slice(1);
    if(raw.endsWith("|")&&!raw.endsWith(String.fromCharCode(92)+"|"))raw=raw.slice(0,-1);
    const cells=[];let cell="",ticks=0;
    const tick=String.fromCharCode(96),slash=String.fromCharCode(92);
    for(let i=0;i<raw.length;i++){
      const ch=raw[i];
      if(ch===slash&&raw[i+1]==="|"){cell+="|";i++;continue;}
      if(ch===tick){
        let count=1;while(raw[i+count]===tick)count++;
        ticks=ticks===0?count:ticks===count?0:ticks;
        cell+=tick.repeat(count);i+=count-1;continue;
      }
      if(ch==="|"&&ticks===0){cells.push(cell.trim());cell="";continue;}
      cell+=ch;
    }
    cells.push(cell.trim());return cells;
  }
  function tableDivider(cells,count){
    return cells&&cells.length===count&&
      cells.every(cell=>/^:?-{3,}:?$/.test(cell));
  }
  function appendTable(out,header,divider,rows){
    const scroll=n("div",null,"md-table-scroll");
    const table=n("table",null,"md-table"),head=n("thead"),body=n("tbody");
    const align=divider.map(cell=>cell.startsWith(":")&&cell.endsWith(":")?"center":
      cell.endsWith(":")?"right":"left");
    const headerRow=n("tr");
    header.forEach((cell,j)=>{const th=n("th",strip(cell));th.scope="col";th.style.textAlign=align[j];headerRow.append(th);});
    head.append(headerRow);
    rows.forEach(cells=>{
      const row=n("tr");
      header.forEach((_,j)=>{const td=n("td",strip(cells[j]||""));td.style.textAlign=align[j];row.append(td);});
      body.append(row);
    });
    table.append(head,body);scroll.append(table);out.append(scroll);
  }
  function markdown(container,source){
    const lines=source.split(/\r?\n/);const out=document.createDocumentFragment();
    let fenced=false,pre=[],list=null;
    const flushList=()=>{if(list){out.append(list);list=null;}};
    const flushPre=()=>{if(pre.length){out.append(n("pre",pre.join("\n")));pre=[];}};
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(line.trim().startsWith(String.fromCharCode(96).repeat(3))){flushList();if(fenced)flushPre();fenced=!fenced;continue;}
      if(fenced){pre.push(line);continue;}
      const header=tableCells(line),divider=tableCells(lines[i+1]||"");
      if(header&&tableDivider(divider,header.length)){
        flushList();const rows=[];
        while(i+2<lines.length){
          const cells=tableCells(lines[i+2]);
          if(!cells)break;
          rows.push(cells);i++;
        }
        appendTable(out,header,divider,rows);i++;continue;
      }
      const h=/^(#{1,4})\s+(.+)/.exec(line);
      if(h){flushList();out.append(n("h"+Math.min(3,h[1].length),strip(h[2])));continue;}
      const bullet=/^\s*[-*+]\s+(.+)/.exec(line);
      if(bullet){if(!list)list=n("ul");list.append(n("li",strip(bullet[1])));continue;}
      flushList();
      if(!line.trim())continue;
      if(/^>/.test(line)){out.append(n("blockquote",strip(line.replace(/^>\s*/,""))));continue;}
      out.append(n("p",strip(line)));
    }
    flushList();flushPre();container.replaceChildren(out);
  }
  async function openDoc(source){
    $("overlay").classList.add("open");
    $("doc-title").textContent="读取文档…";$("doc-source").textContent=source;
    $("doc-content").replaceChildren(n("p","读取规范性源文档中…"));
    try{
      const data=await fetchJSON("/api/docs?path="+encodeURIComponent(source));
      $("doc-title").textContent=data.title;$("doc-source").textContent=data.path+"  ·  最后修改 "+new Date(data.modifiedAt).toLocaleDateString();
      markdown($("doc-content"),data.markdown);
    }catch(e){$("doc-content").replaceChildren(n("p","文档无法打开："+e.message,"error"));}
  }
  function setupDocs(){
    const docs=project.documents||[];
    const quick=["docs/product/vision.md","docs/product/requirements.md","docs/architecture/overview.md","docs/CONSTITUTION.md"];
    $("quickdocs").replaceChildren(...quick.map(p=>preview(docs.find(d=>d.path===p))));
    const specs=docs.filter(d=>d.path.startsWith("docs/specs/"));
    $("specdocs").replaceChildren(...(specs.length?specs.map(docButton):[n("div","暂无已发布功能规格","docs-empty")]));
    $("requirement-list").replaceChildren(...(project.requirements.items || []).map(req=>{
      const b=n("button",null,"docitem");b.type="button";
      const head=n("span",req.id,"taskid");
      const tag=n("span",req.stage,"chip");tag.style.float="right";
      b.append(head,tag,n("b",req.title),n("small","验收重点 · "+req.acceptance));
      b.addEventListener("click",()=>openDoc("docs/product/requirements.md"));
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
  function renderOnboarding(){
    const panel=$("onboarding-panel");
    if(!onboarding){panel.classList.add("hide");return;}
    panel.classList.toggle("hide",onboarding.readiness==="ready_for_review");
    const fresh=onboarding.kind==="new";
    $("onboarding-title").textContent=fresh?"新项目首次接入":"已有项目基线核对";
    $("onboarding-next").textContent="下一步："+onboarding.nextAction+
      "。该清单仅检查真实 Git 与 SQLite 状态，不自动创建或批准任务。";
    $("onboarding-steps").replaceChildren(...onboarding.steps.map(step=>{
      const row=n("div",null,"onboardrow");
      const detail=n("div");detail.append(n("b",step.label),
        n("small",step.source||step.suggestedPath||step.instruction));
      row.append(detail,n("span",step.status==="present"?"已找到":"待确认","taskid"));
      return row;
    }));
  }
  function render(){
    $("projectcrumb").textContent=project.name;
    $("projectname").textContent=project.name.toUpperCase();
    $("projectstate").textContent=project.projectStatus==="documented"?"核心文档已建立":"基础文档不完整";
    $("branch").textContent="Git · "+(project.git.branch||"未识别")+" · "+(project.git.head||"无提交");
    $("project-intro").textContent=project.vision.summary||"项目愿景尚未建立，建议先维护权威文档，而不是由 Agent 编造项目介绍。";
    $("vision-title").textContent=project.vision.title;
    $("vision-summary").textContent=project.vision.summary||"产品愿景尚未建立。";
    $("roadmap-title").textContent=project.roadmap.title;
    $("roadmap-summary").textContent=project.roadmap.summary||"路线图尚未建立。";
    $("roadmap-source").textContent=project.roadmap.source;
    $("okr-title").textContent=project.okr.title;
    $("okr-summary").textContent=project.okr.summary||"本项目暂未建立可读取的阶段目标。";
    $("okr-source").textContent=project.okr.source;
    $("requirements-title").textContent=project.requirements.title;
    $("fr-count").textContent=String(project.requirements.frCount);
    $("nfr-count").textContent=String(project.requirements.nfrCount);
    $("architecture-title").textContent=project.architecture.title;
    $("architecture-summary").textContent=project.architecture.summary||"架构文档尚未建立。";
    $("architecture-diagram").textContent=project.architecture.diagram;
    $("architecture-diagram").classList.toggle("hide",!project.architecture.diagram);
    // Governance tasks must not inflate the perceived product delivery rate.
    const all=Object.values(board.columns).flat();
    const productTasks=taskRows().filter(row=>taskBucket(row)!==null);
    const governance=all.filter(t=>t.track==="governance");
    $("s-total").textContent=String(productTasks.length);
    $("s-done").textContent=String(productTasks.filter(t=>taskBucket(t)==="completed").length);
    $("s-active").textContent=String(productTasks.filter(t=>taskBucket(t)==="in_progress").length);
    $("s-pending").textContent=String(productTasks.filter(t=>taskBucket(t)==="not_started").length);
    $("governance-count").textContent="工程治理 · "+governance.filter(t=>t.status==="verified").length+"/"+governance.length+" 完成";
    $("next-id").textContent=board.current||"暂无可领取任务";
    const candidate=all.find(t=>t.id===board.current);
    const productNext=all.filter(t=>t.track==="product")
      .find(t=>t.status!=="verified"&&!t.blockedBy.length&&!t.unverifiedChildren.length);
    $("next-title").textContent=candidate?.title||"暂无可执行任务";
    $("next-detail").textContent=candidate?
      ("版本："+candidate.release+" · 状态："+candidate.status+
        (candidate.blockedBy.length?" · 前置依赖："+candidate.blockedBy.join("、"):"")+
        (candidate.track!=="product"&&productNext?" · 产品主线下一任务："+productNext.id+"（待当前任务结束后领取）":"")):
      "当前无符合依赖条件的任务；可在任务列表查看工作进度。";
    setupDocs();
    renderOnboarding();
    renderTaskList();
    renderFeatures();
    $("synced").textContent="同步于 "+new Date().toLocaleTimeString();
  }
  async function reload(){
    try{const [nextProject,nextBoard,nextFeatures,nextOnboarding,nextReleasePlan]=await Promise.all([
      fetchJSON("/api/project"),fetchJSON("/api/board"),fetchJSON("/api/features"),fetchJSON("/api/onboarding"),
      fetchJSON("/api/release-plan")]);
      project=nextProject;board=nextBoard;features=nextFeatures.features||[];
      onboarding=nextOnboarding;releasePlan=nextReleasePlan;render();}
    catch(e){$("project-intro").textContent="无法读取项目资料："+e.message;}
  }
  for(const b of document.querySelectorAll(".navbtn"))b.addEventListener("click",()=>go(b.dataset.view));
  for(const b of document.querySelectorAll("[data-go]"))b.addEventListener("click",()=>go(b.dataset.go));
  for(const b of document.querySelectorAll("[data-doc]"))b.addEventListener("click",()=>openDoc(b.dataset.doc));
  for(const b of document.querySelectorAll("[data-tasktab]"))
    b.addEventListener("click",()=>setTaskTab(b.dataset.tasktab));
  $("task-search").addEventListener("input",renderTaskList);
  $("open-vision").addEventListener("click",()=>openDoc("docs/product/vision.md"));
  $("open-roadmap").addEventListener("click",()=>openDoc("docs/roadmap/releases.md"));
  $("open-okr").addEventListener("click",()=>openDoc(project?.okr.source||"docs/okr/README.md"));
  $("open-requirements").addEventListener("click",()=>openDoc("docs/product/requirements.md"));
  $("open-architecture").addEventListener("click",()=>openDoc("docs/architecture/overview.md"));
  $("doc-search").addEventListener("input",renderDocs);
  $("history-refresh").addEventListener("click",loadHistory);
  $("history-search").addEventListener("keydown",e=>{if(e.key==="Enter")loadHistory();});
  $("reload").addEventListener("click",reload);
  $("share-lan").addEventListener("click",showLanAccess);
  $("close").addEventListener("click",()=>$("overlay").classList.remove("open"));
  $("overlay").addEventListener("click",e=>{if(e.target===$("overlay"))$("overlay").classList.remove("open");});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")$("overlay").classList.remove("open");});
  localizeChrome();
  const requested=location.hash.slice(1);if(titles[requested])go(requested);
  reload();setInterval(()=>{if(document.visibilityState==="visible")reload();},30000);
})();
</script></body></html>`;
}
