import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { projectHtml } from '../project-html.js';

describe('v5 lightweight single-project workbench', () => {
  test('eight first-level menus, separate architecture, bugs and developer guide', () => {
    const html=projectHtml('safe-nonce');
    const views=[...html.matchAll(/<button[^>]*class="navbtn[^" ]*[^>]*data-view="([^"]+)"/g)]
      .map(m=>m[1]);
    expect(views).toEqual(['overview','requirements','architecture','tasks',
      'issues','history','guide','settings']);
    for(const view of views)expect(html).toContain('id="view-'+view+'"');
    expect(html).toContain('content="light"');
    expect(html).toContain('mcp-probe-kit · 研发工作台');
    expect(html).toContain('alt="mcp-probe-kit 官方 Logo"');
    expect(html).toContain('data:image/webp;base64,');
    expect(html).toContain('id="brand-version"');
    expect(html).toContain('id="sidebar-github"');
    expect(html).toContain('href="https://github.com/mybolide/mcp-probe-kit"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('id="sidebar-docs"');
    expect(html).toContain('data-go="docs"');
    expect(html).toContain('id="hero-verified"');
    expect(html).toContain('id="hero-total"');
    expect(html).toContain('id="hero-progress"');
    expect(html).toContain('id="task-clear-filters"');
    expect(html).not.toMatch(/<[^>]+\sstyle="/);
    expect(html).not.toContain('class="mark">D');
    expect(html).toContain('class="overview-primary"');
    expect(html).toContain('class="baseline-details"');
    expect(html).toContain('保存 MCP 环境配置');
    expect(html).toContain('MEMORY_SEARCH_LIMIT');
    expect(html).toContain('MEMORY_SUMMARY_MAX_CHARS');
    expect(html).not.toContain('<h2>API Token</h2>');
    expect(html.slice(html.indexOf('<nav'),html.indexOf('</nav>')))
      .not.toContain('Bug 与架构变更');
    expect(html).not.toContain('start_feature 直接记录');
  });

  test('compiled source has CSP nonce, valid JavaScript and no framework/runtime fetch', () => {
    const html=projectHtml('known-nonce','en');
    const match=/<script nonce="known-nonce">([\s\S]+?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    expect(()=>new vm.Script(match![1])).not.toThrow();
    expect(html).not.toContain('__TRANSLATIONS__');
    expect(html).not.toContain('__NONCE__');
    expect(html).toContain('createHashRouter');
    expect(html).toContain("if(view==='overview')reload();else refreshTaskData()");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+(googleapis|fonts)/);
    // Detailed human overview, frozen contract and shared task relations add
    // about 2.4 KB gzip, while preserving the single-request CSP-safe UI.
    expect(html).toContain('id="vision-title"');
    expect(html).toContain('id="roadmap-title"');
    expect(html).toContain('id="okr-title"');
    expect(html).toContain('id="architecture-changes"');
    expect(html).toContain('id="database-design-sources"');
    expect(html).toContain("fetchJSON('/api/architecture/database')");
    for(const id of ['overview-insight-metrics','idea-list',
      'bug-insight-metrics','guide-project-context','settings-diff','history-shortcuts']){
      expect(id==='history-shortcuts'?html.includes('class="history-shortcuts"'):
        html.includes('id="'+id+'"')).toBe(true);
    }
    expect(html).not.toContain('id="task-granularity"');
    expect(html).not.toContain('ATOMIC TASK AUDIT');
    expect(html).toContain("fetchJSON('/api/insights')");
    // Feature plans in independent projects must never render the retired dark
    // simple-task cards while whole-release plans use light cards.
    expect(html).toContain('function renderTaskCard(row)');
    expect(html).toContain('for(const row of items)list.append(renderTaskCard(row))');
    expect(html).not.toContain('n("button",null,"simple-task")');
    // Feature-only plans do not have the release-work summary node. A stale
    // dereference used to throw after opening the drawer, leaving it blank.
    expect(html).not.toContain('$("release-review-summary").replaceChildren()');
    expect(html).toContain("input.closest('.settings-switch-row')||input.closest('label')");
    expect(html).toContain('.settings-switch-row>.switch');
    expect(html).toContain('function renderTaskContract(contract,dual)');
    expect(html).toContain('renderTaskContract(safeSummary,data.content)');
    expect(html).toContain('function renderOverview(contract,completion,readability,dual)');
    expect(html).toContain('renderOverview(safeSummary,note,data.readability,data.content)');
    expect(html).toContain('AI 独立执行说明 · E');
    expect(html).toContain('尚未记录独立工作内容');
    expect(html).toContain('本次不做');
    expect(html).toContain('id="task-readability-audit"');
    expect(html).toContain('fetchJSON("/api/task-readability")');
    expect(html).toContain('function renderRelationships(contract)');
    expect(html).toContain('renderRawContract(data.executionContract,data.contract)');
    expect(html).toContain('aria-label","任务阅读方式');
    for(const label of ['任务概览','执行合同','查看任务关联',
      '查看原始合同 · MCP execution-contract','查看原始冻结任务规格及版本',
      '当前阻塞与下一步']){
      expect(html).toContain(label);
    }
    expect(html).toContain('task-delivery-details:before');
    expect(html).toContain('function clearTaskFilters()');
    expect(html).toContain('function renderTaskList()');
    expect(html).toContain('task-empty-state');
    expect(html).toContain('aria-current');
    expect(html).toContain('.task-detail-view [hidden]');
    for(const label of ['任务说明','必须完成什么 · 验收目标','对应需求',
      '已批准的执行步骤','实施步骤的规格状态','文件修改范围',
      '必须通过的质量门禁','交付验收应保留的真实证据']){
      expect(html).toContain(label);
    }

    expect(html).toContain('items=(data.items||[]).filter(item=>item.kind==="bug")');
    expect(html).toContain('items=(data.items||[]).filter(item=>item.kind!=="bug")');
    expect(html).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    // Added accessible project resources and filter states remain inside a
    // bounded single-document payload, with zero remote CSS/JS dependencies.
    // Source-backed action center adds contextual, interactive task guidance
    // without a framework or remote assets. Keep its compressed budget bounded.
    // Keep the entire offline UI small even after the shared select control
    // and compact empty-state accessibility/visual refinements.
    expect(gzipSync(Buffer.from(html)).byteLength).toBeLessThan(74_000);
    expect(html).toContain('id="attention-center"');
    expect(html).toContain('id="attention-list"');
    expect(html).not.toContain('data-tasktab="attention"');
    expect(html).not.toContain('id="task-attention-filters"');
    expect(html).not.toContain('id="task-attention-mobile"');
    expect(html).not.toContain('count-attention');
    expect(html).toContain('data-tasktab="not_started" aria-selected="true"');
    expect(html).toContain('data-tasktab="in_progress"');
    expect(html).toContain('data-tasktab="completed"');
    expect(html).toContain('id="mobile-nav-more"');
    expect(html).toContain('id="task-show-more"');
    expect(html).toContain('function showTaskFocus(kind)');
    expect(html).toContain('function taskAttentionKind(row)');
    expect(html).toContain('function renderAttentionCenter()');
    expect(html).toContain('id="decision-request-panel"');
    expect(html).toContain('id="idea-disclosure"');
    expect(html).toContain('class="panelhead idea-disclosure-summary"');
    expect(html).toContain("classList.toggle('is-empty',decisionRequests.length===0)");
    expect(html).toContain('background-position:right 15px center');
    expect(html).toContain('appearance:none');
    expect(html).toContain('id="decision-request-list"');
    expect(html).toContain('id="decision-request-filter"');
    expect(html).toContain('function loadDecisionRequests()');
    expect(html).toContain('decision-request-submit');
    expect(html).toContain('/api/decision-requests/');
    expect(html).toContain('idempotencyKey');
    expect(html).toContain('提交只记录决定，不修改任务合同或审批状态');
    expect(html).toContain('canManageSettings===false');
  });

  test('Hash navigation handles deep links and back/forward without reload', () => {
    const source=readFileSync(resolve(import.meta.dirname,'../workbench/router.js'),'utf8')
      .replace('export function','function');
    const listeners=new Map<string,()=>void>();
    let hash='#architecture';
    const location={get hash(){return hash;},set hash(value:string){
      hash=value.startsWith('#')?value:'#'+value;
    }};
    const window={location,addEventListener:(key:string,cb:()=>void)=>listeners.set(key,cb)};
    const create=vm.runInNewContext(source+'\ncreateHashRouter;', {window}, {timeout:1000}) as
      (views:string[],cb:(view:string)=>void)=>{sync:()=>void;go:(view:string)=>void;current:()=>string};
    const seen:string[]=[];
    const router=create(['overview','architecture','tasks'],view=>seen.push(view));
    router.sync();expect(seen).toEqual(['architecture']);
    router.go('tasks');expect(window.location.hash).toBe('#tasks');
    listeners.get('hashchange')?.();expect(router.current()).toBe('tasks');
    window.location.hash='#architecture';listeners.get('hashchange')?.();
    expect(seen.at(-1)).toBe('architecture');
    router.go('unknown');expect(router.current()).toBe('architecture');
  });
});
