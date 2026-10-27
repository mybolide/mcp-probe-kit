/**
 * UI language is a per-viewer presentation choice, not a shared project setting.
 * The chat host can pass ?lang=... from its active conversation. Browsers
 * otherwise use Accept-Language. Source Specs and database IDs are not translated.
 */
export type WorkbenchLocale = "zh-CN" | "en";

export function resolveWorkbenchLocale(
  requested: string | null | undefined, acceptLanguage = "",
): WorkbenchLocale {
  const explicit = requested?.trim();
  if (explicit && /^(zh(?:-[A-Za-z]{2,4})?|en(?:-[A-Za-z]{2,4})?)$/i.test(explicit)) {
    return explicit.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
  }
  const ranked = acceptLanguage.split(",").map((part) => {
    const [tag,weight] = part.trim().split(";q=");
    return {tag:tag?.trim().toLowerCase()??"",
      q:weight===undefined?1:Number(weight)};
  }).filter(item => Number.isFinite(item.q) && item.q>0 &&
    /^(zh|en)(?:-|$)/.test(item.tag)).sort((a,b)=>b.q-a.q);
  return ranked[0]?.tag.startsWith("en") ? "en" : "zh-CN";
}

/**
 * Only application chrome is localized. Technical names, personal data,
 * source requirements and free-text task content are NEVER machine rewritten.
 * New languages can add independent catalogs using the same keys.
 */
export const enUi: Record<string,string> = {
  "研发工作台":"Development workspace","项目工作台":"Project workspace",
  "项目总览":"Overview","产品与目标":"Product & goals",
  "需求管理":"Requirements","技术架构":"Architecture","任务与进度":"Tasks & progress",
  "Bug 与架构变更":"Bugs & architecture changes","项目历史会话":"Session history",
  "文档中心":"Documents","本地工作台":"Local workspace",
  "单一事实来源":"Single source of truth","项目":"Project","总览":"Overview",
  "任务进度":"Tasks","Bug 与变更":"Bugs & changes","历史会话":"Session history",
  "局域网连接":"LAN access","↻ 同步信息":"↻ Refresh",
  "项目概览":"Project overview","了解项目，更清楚下一步":"Understand progress and next steps",
  "正在读取项目愿景与开发规范…":"Loading project vision and engineering rules…",
  "读取源文档":"Loading source documents","任务进度来自 SQLite":"Task progress from SQLite",
  "项目接入":"Project onboarding","接入检查":"Onboarding checks",
  "任务总数（含待审核）":"Total tasks (including draft)",
  "已完成":"Completed","开发中":"In progress","未开始（含待审核）":"Not started (including draft)",
  "未开始":"Not started","当前研发焦点":"Current development focus","查看任务 →":"View tasks →",
  "当前任务":"Current task","读取下一任务…":"Loading next task…",
  "由任务依赖与验收状态决定，不随聊天内容任意跳步。":
    "Determined by verified dependencies, not by arbitrary chat requests.",
  "新人快速上手":"New member onboarding","入门指引":"Onboarding",
  "正在读取规范性文件索引…":"Loading canonical document index…",
  "从需求到可验证交付":"From requirements to verified delivery","研发流程":"Development process",
  "产品目标":"Product goals","架构与规格":"Architecture & specs",
  "任务与计划":"Tasks & plan","质量与追溯":"Quality & traceability",
  "产品愿景":"Product vision","产品定位与阶段目标":"Product positioning & milestones",
  "项目使命":"Project mission","读取中…":"Loading…",
  "阅读完整产品愿景 →":"Read full product vision →","版本规划":"Release roadmap",
  "版本路线图":"Release roadmap","查看版本路线 →":"View roadmap →",
  "阶段目标":"Milestone goals","阶段目标与原则":"Milestones & principles",
  "查看阶段目标 →":"View milestone goals →",
  "需求范围":"Requirements scope","需求与功能边界":"Requirements & scope",
  "产品需求":"Product requirements","功能需求 FR":"Functional requirements",
  "非功能需求 NFR":"Nonfunctional requirements",
  "查看完整产品需求 →":"Read all requirements →",
  "功能需求清单":"Functional requirements","查看完整 PRD →":"Read PRD →",
  "功能提案与规格":"Feature proposals & specs","数据库记录":"Database records",
  "既有 Git 功能规格":"Git feature specs","全部文档 →":"All documents →",
  "架构与职责":"Architecture & ownership","系统架构与工程边界":"System architecture & boundaries",
  "总体架构":"Architecture overview","查看完整架构说明 →":"Read architecture →",
  "任务管理":"Task management","任务列表":"Task list","任务状态":"Task status",
  "搜索任务…":"Search tasks…",
  "按实际任务状态查看进度；待审核任务归入未开始，不等于获准开发。":
    "View real task status. Pending review is not permission to start development.",
  "缺陷与变更":"Defects & changes","缺陷与架构变更":"Bugs & architecture changes",
  "项目记录":"Project history","项目文档":"Project documents","项目文档中心":"Project documents",
  "搜索产品、架构、需求、ADR、Spec…":"Search product, architecture, requirements, ADR, Specs…",
  "没有匹配的文档，或项目尚未建立规范索引。":"No matching or indexed project documents.",
  "等待同步":"Waiting for refresh",
  "任务详情 / 原始依据":"Task details / source evidence","关闭 ×":"Close ×",
  "文档":"Document","待审核":"Pending review","等待验收":"Awaiting review",
  "未分配":"Unassigned","未排期":"Unscheduled","负责人":"Owner",
  "负责人 / 开发电脑":"Owner / development device","需求来源":"Requirements",
  "使用场景 / 触发条件 / 用户期望":"Trigger / scenario / expected outcome",
  "按顺序执行的业务与系统流程":"Ordered workflow",
  "业务规则与不可变约束":"Business invariants and rules",
  "具体工作与完成条件":"Implementation and completion conditions",
  "技术方案与约束":"Design reference and constraints",
  "原始需求、Spec 与测试用例依据":"Canonical spec and tests",
  "已确认决策、限制和审查备注":"Decisions and review notes",
  "待确认问题与阻塞决策":"Open questions and blocked decisions",
  "正向测试":"Positive tests","异常 / 边界场景":"Negative and boundary tests",
  "交付验收应保留的真实证据":"Required real verification evidence",
  "不在本任务范围":"Out of scope","交付文件 / 产物":"Deliverables",
  "依赖、阶段与允许变更":"Dependencies and allowed scope",
  "规格缺口与审核提示":"Spec review warnings",
  "当前状态与执行边界":"State and execution boundary",
  "没有匹配的任务。":"No matching tasks.","当前没有任务。":"No tasks in this state.",
  "尚无任务说明":"No task description",
};
