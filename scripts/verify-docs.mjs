import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const failures = [];
const checks = [];

function check(condition, message) {
  checks.push(message);
  if (!condition) failures.push(message);
}

function read(relative) {
  return readFileSync(resolve(root, relative), 'utf8');
}

function readJson(relative) {
  return JSON.parse(read(relative));
}

function nested(object, dotted) {
  return dotted.split('.').reduce((value, key) => value?.[key], object);
}

const globalLanguages = ['zh-CN', 'en', 'ja', 'ko'];
const globalTranslations = Object.fromEntries(
  globalLanguages.map((lang) => [lang, readJson(`docs/i18n/${lang}.json`)]),
);

for (const page of ['docs/index.html', 'docs/pages/apps.html']) {
  const html = read(page);
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
  check(keys.length > 0, `${page} contains i18n keys`);
  for (const lang of globalLanguages) {
    for (const key of keys) {
      check(
        nested(globalTranslations[lang], key) !== undefined,
        `${page}: ${lang} contains ${key}`,
      );
    }
  }
}

const manifest = readJson('tools-manifest.json');
const expectedToolNames = new Set();
for (const category of Object.values(manifest.categories)) {
  for (const name of category.tools) expectedToolNames.add(name);
}
for (const name of manifest.toolsets.appOnly.tools) expectedToolNames.add(name);

const toolsSource = read('docs/data/tools.js');
const context = {};
vm.runInNewContext(`${toolsSource}\nthis.__TOOLS__ = toolsData;`, context);
const toolsData = context.__TOOLS__;
const generatedNames = new Set();
for (const [key, value] of Object.entries(toolsData)) {
  if (key === 'categories' || !Array.isArray(value)) continue;
  for (const tool of value) generatedNames.add(tool.name);
}
check(generatedNames.size === expectedToolNames.size, 'generated tool documentation count matches registry + App-only');
for (const name of expectedToolNames) {
  check(generatedNames.has(name), `generated tools include ${name}`);
}
check(toolsData.counts.default === 23, 'generated docs expose 23 default model tools');
check(toolsData.counts.withMemory === 29, 'generated docs expose 29 tools with Memory');
check(toolsData.counts.full === 33, 'generated docs expose 33-tool full surface');
check(toolsData.counts.appOnly === 1, 'generated docs expose one App-only action');

for (const lang of globalLanguages) {
  const data = readJson(`docs/i18n/all-tools/${lang}.json`);
  check(data.ui?.oneLine, `all-tools ${lang} translates one-line call label`);
  check(data.ui?.copy, `all-tools ${lang} translates copy action`);
  check(data.ui?.details, `all-tools ${lang} translates details action`);
  for (const name of expectedToolNames) {
    check(data.toolsData?.[name] !== undefined, `all-tools ${lang} translates ${name}`);
    check(data.toolShortDesc?.[name] !== undefined, `all-tools ${lang} has short label for ${name}`);
    if (name !== 'list_memory_assets') {
      check(
        typeof data.toolsData?.[name]?.prompt === 'string' && data.toolsData[name].prompt.length > 12,
        `all-tools ${lang} has copyable one-line prompt for ${name}`,
      );
    }
  }
  for (const category of Object.keys(toolsData.categories)) {
    check(data.categories?.[category]?.title, `all-tools ${lang} translates category ${category}`);
  }
}

const demoFiles = [
  'docs/demos/feature-workbench.html',
  'docs/demos/bug-workbench.html',
  'docs/demos/memory-center.html',
  'docs/demos/product-workbench.html',
  'docs/demos/convergence-gate.html',
];
for (const file of demoFiles) {
  check(existsSync(resolve(root, file)), `${file} exists`);
  if (existsSync(resolve(root, file))) {
    const html = read(file);
    check(html.includes('window.__MCP_PROBE_DEMO__='), `${file} embeds demo configuration`);
    check(html.includes('data-app-kind='), `${file} reuses MCP App shell`);
  }
}

const gifFiles = [
  'docs/assets/demos/feature-workbench.gif',
  'docs/assets/demos/memory-center.gif',
  'docs/assets/demos/convergence-gate.gif',
];
for (const file of gifFiles) {
  const absolute = resolve(root, file);
  check(existsSync(absolute), `${file} exists`);
  if (existsSync(absolute)) {
    const size = statSync(absolute).size;
    check(size > 1024, `${file} is not empty`);
    check(size < 1024 * 1024, `${file} stays below 1 MiB`);
  }
}

const readmes = ['README.md', ...['zh-CN','ja-JP','ko-KR','es-ES','fr-FR','de-DE','pt-BR'].map((lang) => `i18n/README.${lang}.md`)];
for (const file of readmes) {
  const text = read(file);
  check(text.includes('<!-- v4-showcase:start -->'), `${file} contains v4 showcase`);
  check(text.includes('feature-workbench.gif'), `${file} embeds Feature Workbench animation`);
  check(text.includes('memory-center.gif'), `${file} embeds Memory Center animation`);
  check(text.includes('convergence-gate.gif'), `${file} embeds Convergence Gate animation`);
  check(text.includes('/pages/apps.html'), `${file} links to live MCP Apps demos`);
  check(!text.includes('mcp-probe-kit@latest'), `${file} does not present stable latest as v4 preview`);
  check(!text.includes('v4.0.0-rc.3'), `${file} has no stale rc.3 reference`);
  check(!text.includes('/pages/migration.html'), `${file} uses the v4 migration guide`);
  check(!text.includes('gitnexus@latest mcp'), `${file} has no obsolete GitNexus @latest launcher`);
}

const documentationPages = [
  'docs/pages/getting-started.html',
  'docs/pages/all-tools.html',
  'docs/pages/apps.html',
  'docs/pages/examples.html',
  'docs/pages/migration-v4.html',
  'docs/pages/migration.html',
];
for (const file of documentationPages) {
  const text = read(file);
  check((text.match(/docs-shell:start/g) ?? []).length === 1, `${file} has one generated shell start marker`);
  check((text.match(/docs-shell:end/g) ?? []).length === 1, `${file} has one generated shell end marker`);
  check(text.includes('data-doc-shell="topbar"'), `${file} uses the canonical 56px topbar`);
  check(text.includes('data-doc-shell="sidebar"'), `${file} uses the canonical documentation sidebar`);
  check(text.includes('class="flex-1 mt-14 min-h-screen md:ml-64"'), `${file} starts content after the shared shell`);
  check(text.includes('class="w-full max-w-none p-4 sm:p-6 lg:p-8 xl:p-10"'), `${file} fills the remaining viewport with shared padding`);
  check(text.includes('text-2xl sm:text-3xl font-bold text-text-primary'), `${file} uses the shared H1 scale`);
  check((text.match(/id="lang-switcher-container"/g) ?? []).length === 1, `${file} contains exactly one language switcher`);
  check(text.includes('../assets/css/docs-shell.css'), `${file} loads shared shell styles`);
  check(text.includes('../assets/js/docs-shell.js'), `${file} loads shared shell behavior`);
  check(text.includes('../assets/logo.png'), `${file} uses the local favicon`);
  check(!text.includes('max-w-4xl mx-auto'), `${file} has no obsolete fixed-width document container`);
  check(!text.includes('sticky top-0 z-50'), `${file} has no standalone marketing navigation`);
}

const packageJson = readJson('package.json');
check(packageJson.scripts?.['docs:sync-shell'] === 'tsx scripts/sync-doc-shell.ts', 'package exposes docs:sync-shell');
check(packageJson.scripts?.['docs:build']?.startsWith('npm run docs:sync-shell'), 'docs:build synchronizes the canonical shell first');
check(existsSync(resolve(root, 'scripts/sync-doc-shell.ts')), 'canonical docs shell generator exists');
check(existsSync(resolve(root, 'docs/assets/css/docs-shell.css')), 'shared docs shell CSS exists');
check(existsSync(resolve(root, 'docs/assets/js/docs-shell.js')), 'shared docs shell JS exists');

const allToolsPage = read('docs/pages/all-tools.html');
check(allToolsPage.includes('data-copy-tool='), 'all-tools renders per-tool copy controls');
check(allToolsPage.includes('navigator.clipboard.writeText'), 'all-tools uses the Clipboard API');
check(allToolsPage.includes("document.execCommand('copy')"), 'all-tools includes a clipboard fallback');
check(allToolsPage.includes('<details class='), 'all-tools keeps parameters and schemas collapsed');
check(allToolsPage.includes('surface-filters'), 'all-tools exposes tool-surface filters');
check(allToolsPage.includes('category-nav'), 'all-tools uses category navigation');
check(allToolsPage.includes('catalog-tool-link'), 'all-tools lists tool names under every category');
check(allToolsPage.includes('md:ml-64'), 'all-tools uses the shared fixed documentation sidebar shell');
check(allToolsPage.includes('w-full max-w-none'), 'all-tools fills the available documentation viewport');
check(allToolsPage.includes('mobile-category-panel'), 'all-tools exposes the full category/tool catalog on smaller screens');
check(allToolsPage.includes('一句话调用'), 'all-tools contains the Chinese one-line call fallback');

const gettingStarted = read('docs/pages/getting-started.html');
check(gettingStarted.includes('w-full max-w-none'), 'getting-started fills the available documentation viewport');
check(!gettingStarted.includes('mcp-probe-kit@latest'), 'getting-started uses npm next for v4');
check(gettingStarted.includes('mcp-probe-kit@next'), 'getting-started includes npm next');
check(gettingStarted.includes('install-agent'), 'getting-started documents project-local Agent fallback');
check(!/npm\s+(?:install|i|update)\s+-g\s+mcp-probe-kit/.test(gettingStarted), 'getting-started does not recommend global mcp-probe-kit installation');

const migrationV4 = read('docs/pages/migration-v4.html');
check(migrationV4.includes('install-agent'), 'migration-v4 documents project-local Agent fallback');
check(!/npm\s+(?:install|i|update)\s+-g\s+mcp-probe-kit/.test(migrationV4), 'migration-v4 does not recommend global mcp-probe-kit installation');
const legacyMigration = read('docs/pages/migration.html');
check(legacyMigration.includes('url=./migration-v4.html'), 'legacy migration URL redirects to the current v4 guide');
check(!legacyMigration.includes('30 个工具'), 'legacy migration URL no longer serves obsolete tool counts');

for (const file of ['docs/index.html', 'docs/pages/apps.html', 'docs/pages/getting-started.html', 'docs/pages/all-tools.html', 'docs/pages/examples.html']) {
  const text = read(file);
  check(!/30 (?:tools|个工具|����)/i.test(text), `${file} has no obsolete 30-tool product claim`);
}

if (failures.length) {
  console.error(JSON.stringify({ passed: false, checks: checks.length, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  passed: true,
  checks: checks.length,
  languages: globalLanguages,
  toolEntries: generatedNames.size,
  liveDemos: demoFiles.length,
  animatedAssets: gifFiles.length,
  readmes: readmes.length,
}, null, 2));
