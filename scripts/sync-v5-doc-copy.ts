/**
 * Keep the *current* v5 landing/docs and all README entrypoints aligned.
 * Never overwrite the preserved v4 frozen specs/migration evidence.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { V5_DEVC_ACTIONS, V5_DEVC_ACTION_GROUPS } from '../src/devcontrol/action-catalog.js';
const root=resolve(import.meta.dirname,'..');
// Only committed actions + this source-controlled guide are documented.
// Uncommitted experimental changes by another Agent must NOT leak into docs
// or be silently approved just because docs are being rebuilt concurrently.
let committedActions: Set<string>;
try {
  const old=execFileSync('git',['show','HEAD:src/devcontrol/action-catalog.ts'],
    {cwd:root,encoding:'utf8',windowsHide:true,timeout:3500});
  const groups=[...old.matchAll(/actions:\s*\[([\s\S]*?)\]/g)];
  committedActions=new Set(groups.flatMap(m=>[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1])));
}catch {
  committedActions=new Set(V5_DEVC_ACTIONS);
}
if(V5_DEVC_ACTIONS.includes('guide'))committedActions.add('guide');
const count=committedActions.size;
function update(file:string,transform:(value:string)=>string) {
  const path=resolve(root,file);
  const source=readFileSync(path,'utf8');
  const next=transform(source);
  if(source!==next) {writeFileSync(path,next,'utf8');console.log('[sync-v5-doc-copy] '+file);}
}
const readmes=['README.md',...['zh-CN','en','ja-JP','ko-KR','es-ES','fr-FR','de-DE','pt-BR']
  .filter(lang=>lang!=='en').map(lang=>'i18n/README.'+lang+'.md')];
for(const file of readmes) update(file,s=>{
  // Prepend the same truthful v5 discovery entrypoint to EVERY language. The
  // historical v4 sections below remain labeled and available for v4 users.
  const begin='<!-- v5-action-navigation:start -->';
  const end='<!-- v5-action-navigation:end -->';
  const entry=`${begin}
> **v5 Agent action navigation / v5 Agent 操作导航（source only, unpublished）**
> Main model tool: **devcontrol**. It exposes **${count} SQLite actions, including a read-only guide**; these are *not* ${count} different MCP tools.
> When unsure call {"action":"guide","input":{"intent":"feature"}} (no project_root, no changes), then follow the returned next action using the real business Git project_root.
> Requirements → Design → single-outcome atomic Tasks → independent review → explicit Owner hash approval → Agent-run genuine tests → evidence + review → Verified.
> The v5 MCP checks and refreshes managed Skill/AGENTS.md at startup and again on the first explicit project tool call, preserving user rules and recognizing guidance revisions even with the same 5.0.0 package version.
> [Agent action guide](${file==='README.md'?'docs/v5-agent-action-guide.md':'../docs/v5-agent-action-guide.md'}) · [v5 web page](${file==='README.md'?'docs/pages/v5-action-guide.html':'../docs/pages/v5-action-guide.html'}) · [SQLite-only contract](${file==='README.md'?'docs/v5-sqlite-only.md':'../docs/v5-sqlite-only.md'}).
> **v4.1.1 stays the separate published npm release.** v4 start_*/file Plans/MCP Apps examples farther below are historical, not v5 callable workflows. Never install unpublished npm 5.0.0.
${end}
`;
  // Remove earlier generated block on subsequent runs, ensuring stable copy.
  const start=s.indexOf(begin),stop=s.indexOf(end);
  if(start>=0&&stop>start) s=s.slice(0,start)+s.slice(stop+end.length).replace(/^\n+/,'');
  if(file==='README.md'){
    s=s.replace(
      'v4 MCP Apps built around retired Plan state are historical demos pending a SQLite project-workbench replacement.',
      'v4 MCP Apps are retained only as historical demonstrations; v5 ships a SQLite DevControl Workbench and a separate Memory Center.'
    ).replace('devcontrol workspace-status --project-root','devcontrol workspace-status --project-root');
  }
  if(file==='i18n/README.zh-CN.md') {
    s=s.replace('v4 的 MCP Apps、Memory、Plan、代码工具和协议兼容功能仍然保留。',
      'v4 的文件式 Plan 和旧 MCP Apps 不在 v5 的对外运行接口内；无状态代码工具、协议兼容能力与可选 Memory 保留。');
  }
  return entry+'\n'+s;
});
for(const file of ['docs/v5-development-guide.md','docs/v5-best-practices.md','docs/devcontrol.md','docs/v5-sqlite-only.md'])update(file,s=>{
  const begin='<!-- v5-agent-action-guide:start -->',end='<!-- v5-agent-action-guide:end -->';
  const note=`${begin}
> **当前 v5 Agent 调用提示**：主 MCP 只有一个 \`devcontrol\` 研发管理工具，包含 **${count} 个 SQLite action（含零副作用 \`guide\` 导航）**。不知道怎样调用时先用
> \`{"action":"guide","input":{"intent":"feature"}}\`（无需 project_root），然后根据返回的示例与真实 Git 项目合同调用下一步。
> [完整 Agent 调用指南](v5-agent-action-guide.md) · [官网导航页](pages/v5-action-guide.html)。启动自动检查并同步 Skill / AGENTS.md 的指导修订号，保留用户规则。
${end}
`;
  const start=s.indexOf(begin),stop=s.indexOf(end);
  if(start>=0&&stop>start) s=s.slice(0,start)+s.slice(stop+end.length).replace(/^\n+/,'');
  return note+'\n'+s;
});
update('docs/v5-best-practices.md',s=>s.replace(
  '默认模型工具面为 **29**（24 基础 + 5 History）、配置 Memory 后 **35**；兼容模式 `MCP_TOOLSET=full` 为 **39**。专用 DevControl MCP 入口需显式注册，不能把它当成 29 个默认工具之一。',
  '默认模型工具面为 **15**（含 5 个 History）、配置 Memory 后为 **21**；完整模型工具面 `MCP_TOOLSET=full` 为 **24**（另有一个 App-only 入口）。主 MCP 自带 `devcontrol`，其 `guide` 可以提供当前阶段调用示例；独立 DevControl 专用服务只在另外显式配置时使用。'
));
update('docs/v5-development-guide.md',s=>s
  .replace('Use **Node.js 22+ for DevControl and the SQLite-backed default History Session**. The older non-DevControl MCP tools still support Node.js 20+.',
    'Use **Node.js 22+ for all v5 runtime entrypoints and SQLite History**. Node.js 20 users should use the separately published v4.1.1 line.')
  .replace(/(?: Project-specific test commands are run by the Agent, with reported evidence and independent gate-review; MCP does not need a language-specific test runner\.)+/g,'')
  .replace('A mock command or an unrelated unit test is not interchangeable with the required Gate.',
    'A mock command or an unrelated unit test is not interchangeable with the required Gate. Project-specific test commands are run by the Agent, with reported evidence and independent gate-review; MCP does not need a language-specific test runner.')
  .replace('`storage_mode=files` opts into legacy feature documentation. Do not confuse a delegated Plan step with an approved DevControl work item.',
    'File-backed v4 task state is not supported. Exported feature Markdown is documentation only; a proposed Feature tree is not an approved DevControl work item.')
  .replace('With Node.js 20, a nonstandard history directory, or `MCP_HISTORY_STORAGE=files`, it uses the earlier Markdown backend.',
    'v5 rejects Node.js 20, custom live History directories and `MCP_HISTORY_STORAGE=files`; Markdown archives are read-only import sources, not a live fallback.')
  .replace('The normal MCP model-visible surface remains 29 tools by default (24 base plus 5 History), 35 with Memory, and 39 in full compatibility mode. These counts do not include the dedicated DevControl operations as default model tools.',
    'The main v5 MCP exposes 15 model tools by default (including SQLite History), 21 with Memory, and 24 in full mode, plus one App-only tool. DevControl is one of those model tools; its '+count+' action values are not separate MCP tool registrations.')
  .replace(/its \d+ action values are not separate MCP tool registrations/g,
    'its '+count+' action values are not separate MCP tool registrations')
);
update('docs/devcontrol.md',s=>s
  .replace('It is developed as an opt-in experiment and does not alter the main MCP toolset.',
    'The main v5 MCP exposes a single `devcontrol` tool for all supported SQLite operations. The separate local DevControl server remains optional.')
  .replace('If Node22 is unavailable, the directory is customized, or\n`MCP_HISTORY_STORAGE=files`, the old Markdown backend remains available.',
    'Node.js 22+ and standard project SQLite History are required for v5. Custom live History directories and `MCP_HISTORY_STORAGE=files` are rejected; Markdown numbered archives may only be read-imported.')
  .replace('On Node22+ Git projects, `start_feature` now defaults to storing the full',
    'On Node22+ Git projects, `devcontrol` `feature-create`/`feature-save` store the full')
  .replace('feature proposal, parent-child draft, delegated Plan and revision history in',
    'feature proposal, parent-child task draft, approved plan and revision history in')
  .replace('The plan first reviews History Session and existing\nnormative documents, then uses `devcontrol feature-save` and',
    'The Agent first reviews SQLite History and existing normative documents, then calls `devcontrol feature-save` and')
  .replace('`storage_mode=files` explicitly opts into the original document workflow.',
    'There is no `storage_mode=files` bypass in v5; exported Markdown is a human-readable artifact only.')
  .replace('`start_bugfix` can register a deduplicated project-local issue, preserving',
    '`devcontrol` `work-record` and `bug-step-save` register and update a project-local issue, preserving')
);
update('docs/v5-sqlite-only.md',s=>s
  .replace(/源码定义的 \d+ 个 DevControl 操作索引(?:（含只读 guide）)?/g,
    '源码定义的 '+count+' 个 DevControl 操作索引（含只读 guide）')
  .replace(/\`devcontrol\` 统一入口：\d+ 个受控 \ `action\`/g,
    '\`devcontrol\` 统一入口：'+count+' 个受控 \`action\`')
  .replace(/\b\d+ 个受控/g,count+' 个受控')
);
update('docs/v5-sqlite-only.md',s=>{
  const start=s.indexOf('| 流程领域 | 可用 `action` |');
  if(start<0)throw Error('v5 action reference table is missing');
  const end=s.indexOf('\n\n',start);
  if(end<0)throw Error('v5 action reference table terminator missing');
  const rows=V5_DEVC_ACTION_GROUPS.map(group=>{
    const actions=group.actions.filter(a=>committedActions.has(a));
    if(!actions.length)return '';
    return '| '+group.title+' ('+actions.length+') | '+actions.map(a=>'`'+a+'`').join('、')+' |';
  }).filter(Boolean);
  const table=['| 流程领域 | 可用 `action` |','|---|---|',...rows].join('\n');
  return s.slice(0,start)+table+s.slice(end);
});
update('docs/v5-agent-action-guide.md',s=>s
  .replace(/\b\d+ 个 action/g,count+' 个 action')
  .replace(/\b\d+ 个是业务操作/g,(count-1)+' 个是业务操作')
  .replace(/\b\d+ 个并列 MCP 工具/g,count+' 个并列 MCP 工具'));
update('docs/pages/v5-action-guide.html',s=>s
  .replace(/\b\d+ 个 DevControl action/g,count+' 个 DevControl action')
  .replace(/\b\d+ 个 action/g,count+' 个 action')
  .replace(/\b\d+ 个动作/g,count+' 个动作'));
update('docs/index.html',s=>s
  .replace(/DevControl guide：按意图导航 \d+ 个动作/g,'DevControl guide：按意图导航 '+count+' 个动作')
  .replace('v4 的 MCP Apps、Product、Feature、Bug 与 Converge 仍在 v5 中保留。',
    'v4 工作流及 MCP Apps 只作为 4.1.1 历史示例；v5 运行时已停用这些旧入口。')
  .replace('v4 · RETAINED','v4.1.1 · ARCHIVE')
  .replace('v4 的 MCP Apps、Product、Feature、Bug 与 Converge 仍在 v5 中保留。',
    'v4 工作流及 MCP Apps 只作为 4.1.1 历史示例；v5 运行时已停用这些旧入口。')
  .replace(/\s*<a href="\.\/pages\/v5-action-guide\.html" class="font-semibold text-accent underline">Agent 调用导航<\/a> ·/g,'')
  .replace('先看 v5 最佳实践</a> ·','先看 v5 最佳实践</a> · <a href="./pages/v5-action-guide.html" class="font-semibold text-accent underline">Agent 调用导航</a> ·')
  .replace(/\n\s*<a href="\.\/pages\/v5-action-guide\.html" class="inline-flex font-semibold text-accent underline">DevControl guide：按意图导航 74 个动作<\/a>/g,'')
  .replace('v5 源码安装与完整功能指南</a>','v5 源码安装与完整功能指南</a>\n          <a href="./pages/v5-action-guide.html" class="inline-flex font-semibold text-accent underline">DevControl guide：按意图导航 74 个动作</a>')
  .replace('来自 Neyna 的实战：完整规划、独立复审、冻结审批、真实 Gate、批量交付与 History 恢复。</p></a>',
    '来自 Neyna 的实战：完整规划、独立复审、冻结审批、真实 Gate、批量交付与 History 恢复。</p></a>')
);
update('docs/pages/v5-development.html',s=>s
  .replace('v4 的 MCP Apps、start_feature、start_bugfix、委托计划、代码检查和可选 Memory 仍然保留。v5 的核心新增内容是项目级研发管理，而不是更换 Agent 或让 MCP 自己编程。',
    'v5 不再支持 v4 文件式 start_feature/start_bugfix、Delegated Plan 和旧 MCP Apps。无状态代码检查与可选 Memory 保留；正式研发状态唯一通过 SQLite DevControl 管理。')
  .replace('旧 Markdown 可以安全导入，在不支持的环境下可回退文件后端。',
    '旧 Markdown 历史可以只读安全导入；v5 不支持回退文件式实时 History。')
  .replace('旧 Markdown 可迁移或采用文件兼容模式。','旧 Markdown 仅允许只读导入，不再双写或回退。')
  .replace('在不支持的环境下可回退文件后端','不支持文件式实时 History 回退')
  .replace('尚未发布。</section>','尚未发布。<a href="./v5-action-guide.html">Agent 如何选择 action？</a></section>')
);
for(const file of ['docs/pages/v5-best-practices.html','docs/pages/apps.html','docs/pages/all-tools.html','docs/pages/getting-started.html','docs/pages/examples.html','docs/pages/migration-v4.html','docs/pages/migration.html'])update(file,s=>{
  const marker='<!-- v5-agent-nav:start -->';
  const block=`${marker}<div class="mx-auto my-4 max-w-5xl rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">v5 源码分支：一个 DevControl 工具 + ${count} 个 action，<a href="./v5-action-guide.html" class="font-semibold underline">先用只读 guide 导航</a>；旧 v4 工作流页面仅用于已发布的 4.1.1 参考。</div><!-- v5-agent-nav:end -->`;
  const start=s.indexOf(marker),end=s.indexOf('<!-- v5-agent-nav:end -->');
  if(start>=0&&end>start) s=s.slice(0,start)+s.slice(end+'<!-- v5-agent-nav:end -->'.length).replace(/^\n/,'');
  // Insert a single prominent link on each document without touching generated sidebar.
  if(s.includes('<main')) s=s.replace(/(<main\b[^>]*>)/, '$1\n'+block);
  return s;
});
for(const [lang,value] of Object.entries({
  'zh-CN':'v5 Agent 调用导航','en':'v5 Agent Action Guide',
  'ja':'v5 Agent 操作ガイド','ko':'v5 Agent 작업 안내',
}))update('docs/i18n/'+lang+'.json',s=>{
  const data=JSON.parse(s) as Record<string,unknown>;
  const sidebar=data.sidebar as Record<string,unknown>;
  sidebar.v5ActionGuide=value;
  return JSON.stringify(data,null,2)+'\n';
});
console.log('[sync-v5-doc-copy] v5 current docs and all 8 README entrypoints synchronized; v4 frozen archives untouched');
