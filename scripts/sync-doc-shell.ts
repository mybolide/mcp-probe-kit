import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type ActivePage = 'getting-started' | 'all-tools' | 'apps' | 'migration-v4' | 'examples' | 'migration-legacy';

const root = resolve(import.meta.dirname, '..');
const pages: Record<string, ActivePage> = {
  'docs/pages/getting-started.html': 'getting-started',
  'docs/pages/all-tools.html': 'all-tools',
  'docs/pages/apps.html': 'apps',
  'docs/pages/examples.html': 'examples',
  'docs/pages/migration-v4.html': 'migration-v4',
  'docs/pages/migration.html': 'migration-legacy',
};

const normal = 'flex items-center gap-2 px-3 py-2 rounded-md text-sm text-text-secondary hover:bg-bg-page hover:text-primary transition-colors no-underline';
const active = 'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-blue-50 text-primary no-underline border-l-3 border-primary';

function item(page: ActivePage, current: ActivePage, href: string, icon: string, key: string, fallback: string, badge = ''): string {
  const selected = page === current || (current === 'migration-legacy' && page === 'migration-v4');
  const badgeHtml = badge ? `<span class="ml-auto ${selected ? 'bg-white' : 'bg-bg-page'} text-xs px-2 py-0.5 rounded-full">${badge}</span>` : '';
  return `<a href="${href}" class="${selected ? active : normal}"${selected ? ' aria-current="page"' : ''}><span>${icon}</span><span data-i18n="${key}">${fallback}</span>${badgeHtml}</a>`;
}

function allToolsMenu(current: ActivePage): string {
  if (current !== 'all-tools') {
    return item('all-tools', current, './all-tools.html', '🛠️', 'sidebar.allTools', '所有工具', '33+1');
  }
  return `<button type="button" onclick="toggleToolsMenu()" class="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium bg-blue-50 text-primary border-l-3 border-primary hover:bg-blue-100 transition-colors" aria-controls="tools-submenu" aria-expanded="true" id="tools-menu-button">
          <span class="flex items-center gap-2"><span>🛠️</span><span data-i18n="sidebar.allTools">所有工具</span></span>
          <span class="flex items-center gap-2"><span class="bg-white text-xs px-2 py-0.5 rounded-full">33+1</span><svg class="w-4 h-4 rotate-180 transition-transform" id="tools-menu-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg></span>
        </button>
        <div id="tools-submenu" class="mt-1 ml-4 border-l border-border pl-2" aria-label="Tool categories"></div>`;
}

function shell(current: ActivePage): string {
  return `<!-- docs-shell:start -->
  <nav class="fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-md border-b border-border z-50" data-doc-shell="topbar">
    <div class="h-full px-4 flex items-center justify-between">
      <a href="../index.html" class="flex items-center gap-2 text-base font-semibold text-text-primary no-underline">
        <span aria-hidden="true">🚀</span><span class="sm:inline hidden">MCP Probe Kit</span>
      </a>
      <div class="flex items-center gap-3">
        <div id="lang-switcher-container"></div>
        <button type="button" onclick="toggleSidebar()" class="md:hidden p-2 text-text-secondary hover:text-primary transition-colors" aria-label="Toggle documentation navigation" aria-controls="sidebar">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </div>
    </div>
  </nav>
  <div class="fixed inset-0 bg-black/50 z-40 backdrop opacity-0 pointer-events-none transition-opacity duration-300 md:hidden" onclick="toggleSidebar()" id="backdrop"></div>
  <aside class="fixed left-0 top-14 bottom-0 w-64 bg-white border-r border-border z-50 sidebar-drawer overflow-y-auto md:translate-x-0 md:block" id="sidebar" data-doc-shell="sidebar">
    <div class="p-4">
      <div class="mb-4">
        <div class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-2" data-i18n="sidebar.quickStart">快速开始</div>
        <a href="../index.html" class="${normal}"><span>🏠</span><span data-i18n="sidebar.home">文档首页</span></a>
        ${item('getting-started', current, './getting-started.html', '📖', 'sidebar.installation', '安装配置')}
      </div>
      <div class="mb-4">
        <div class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-2" data-i18n="sidebar.toolsDocs">工具文档</div>
        ${allToolsMenu(current)}
        ${item('apps', current, './apps.html', '◫', 'sidebar.apps', 'MCP Apps', '5')}
      </div>
      <div class="mb-4">
        <div class="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-2" data-i18n="sidebar.guides">指南</div>
        ${item('migration-v4', current, './migration-v4.html', '🚀', 'sidebar.migration', 'v4 迁移指南')}
        ${item('examples', current, './examples.html', '💡', 'sidebar.examples', '最佳实践')}
      </div>
      <div class="pt-4 border-t border-border">
        <a href="https://github.com/mybolide/mcp-probe-kit" target="_blank" rel="noopener" class="${normal}"><span>💻</span><span>GitHub</span><span class="ml-auto text-xs">↗</span></a>
        <a href="https://npmjs.com/package/mcp-probe-kit" target="_blank" rel="noopener" class="${normal}"><span>📦</span><span>npm</span><span class="ml-auto text-xs">↗</span></a>
      </div>
      <div class="mt-4 pt-4 border-t border-border">
        <div class="text-center">
          <div class="text-xs font-semibold text-text-tertiary mb-2" data-i18n="sidebar.followUs">关注公众号</div>
          <img src="https://oss.bolzjb.com/wx_qrcode.jpg" alt="微信公众号" class="w-[100px] h-[100px] mx-auto rounded-lg border border-border">
          <div class="text-xs text-text-tertiary mt-2" data-i18n="sidebar.getTechSharing">获取更多技术分享</div>
        </div>
      </div>
    </div>
  </aside>
  <!-- docs-shell:end -->`;
}

for (const [relativePath, activePage] of Object.entries(pages)) {
  const absolutePath = resolve(root, relativePath);
  const source = await readFile(absolutePath, 'utf8');
  const pattern = /<!-- docs-shell:start -->[\s\S]*?<!-- docs-shell:end -->/;
  if (!pattern.test(source)) {
    throw new Error(`${relativePath} is missing docs-shell markers`);
  }
  const next = source.replace(pattern, shell(activePage));
  await writeFile(absolutePath, next, 'utf8');
  console.log(`[sync-doc-shell] ${relativePath} -> ${activePage}`);
}
