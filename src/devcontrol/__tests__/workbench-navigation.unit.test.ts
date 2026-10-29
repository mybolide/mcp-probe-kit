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
    expect(html).toContain("router.current()==='tasks'");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+(googleapis|fonts)/);
    // A no-framework local page should remain small even with all frozen
    // task evidence details included. No absolute bundle size handwaving.
    expect(gzipSync(Buffer.from(html)).byteLength).toBeLessThan(45_000);
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
