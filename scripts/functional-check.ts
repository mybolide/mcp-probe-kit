/**
 * 功能校验脚本：模拟用户调用 MCP 工具，打印真实生成结果（非单测）。
 * 运行：MCP_ENABLE_GITNEXUS_BRIDGE=0 npx tsx scripts/functional-check.ts
 * （关掉 GitNexus bridge 以免联网/spawn；记忆未配置时 recall 步与记忆段不出现，属预期）
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { addFeature } from '../src/tools/add_feature.js';
import { startFeature } from '../src/tools/start_feature.js';
import { checkSpec } from '../src/tools/check_spec.js';
import { allToolSchemas } from '../src/schemas/index.js';
import { TOOL_ANNOTATIONS } from '../src/lib/tool-annotations.js';

const log = (t = '') => console.log(t);
const hr = (t: string) => console.log(`\n========== ${t} ==========`);

async function main() {
  // ① add_feature：模板是否真的升级
  hr('① add_feature —— 生成的规格模板（标记检查）');
  const af: any = await addFeature({
    feature_name: 'demo-auth',
    description: '用户认证：支持邮箱登录、注册、密码重置；需要会话保持与失败锁定',
  });
  const guide: string = af.content[0].text;
  const markers = ['FR-1', 'FR-2', '范围边界', 'In Scope', 'Out of Scope', '历史经验与坑', '需求覆盖矩阵', 'SHALL', 'MoSCoW', '对应需求'];
  for (const m of markers) log(`  ${guide.includes(m) ? '✓' : '✗'} 含「${m}」`);
  log(`  模板档位: ${af._meta?.template?.profile}（${af._meta?.template?.requested}）`);

  // ② start_feature：委托计划是否把 check_spec 串进去
  hr('② start_feature —— 委托计划工具顺序');
  const sf: any = await startFeature({ feature_name: 'demo-auth', description: '用户认证：登录/注册/密码重置' });
  const steps = sf.structuredContent?.metadata?.plan?.steps || [];
  steps.forEach((s: any, i: number) => log(`  ${i + 1}. [${s.id}] -> ${s.tool}`));
  log(`  含 check_spec 步: ${steps.some((s: any) => s.tool === 'check_spec') ? '✓ 是' : '✗ 否'}`);
  log(`  含 recall-memory 步: ${steps.some((s: any) => s.id === 'recall-memory') ? '✓ 是' : '— 否（记忆未配置，预期）'}`);

  // ③ check_spec：闸门对「半成品 vs 完整」的判定
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-fc-'));
  const mk = (feature: string, files: Record<string, string>) => {
    const dir = path.join(tmp, 'docs', 'specs', feature);
    fs.mkdirSync(dir, { recursive: true });
    for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), c, 'utf-8');
  };

  hr('③a check_spec —— 半成品规格（弱模型没填全，应打回）');
  mk('bad-feature', {
    'requirements.md': '# 需求文档\n\n## 功能概述\n登录\n\n## 需求列表\n### FR-1: 登录\n[填写：用户故事]\n\n## 非功能需求\n- 无\n\n## 依赖关系\n- 无\n',
    'design.md': '# 设计\n\n## 概述\nx\n\n## 技术方案\nx\n\n## 文件结构\nx\n',
    'tasks.md': '# 任务\n\n## 任务列表\n- [ ] 1.1 做点什么\n',
  });
  const bad: any = await checkSpec({ feature_name: 'bad-feature', project_root: tmp });
  log(`  passed=${bad.structuredContent.passed}  errors=${bad.structuredContent.errorCount}  warnings=${bad.structuredContent.warningCount}`);
  bad.structuredContent.issues.forEach((it: any) => log(`    - [${it.severity}] (${it.file}) ${it.message}`));

  hr('③b check_spec —— 完整规格（应通过）');
  mk('good-feature', {
    'requirements.md': '# 需求文档\n\n## 功能概述\n登录功能\n\n## 需求列表\n### FR-1: 登录\n**用户故事:** 作为用户，我想登录，以便访问系统。\n#### 验收标准（EARS）\n1. WHEN 提交正确凭证 THEN 系统 SHALL 登录成功\n\n## 非功能需求\n- NFR-1: 响应<1s\n\n## 依赖关系\n- 无\n',
    'design.md': '# 设计\n\n## 概述\n登录设计\n**对应需求:** FR-1\n\n## 技术方案\nJWT\n\n## 数据模型\n不涉及\n\n## API 设计\nPOST /api/login\n\n## 文件结构\nsrc/login.ts\n\n## 设计决策\n用 JWT\n\n## 风险评估\n无\n',
    'tasks.md': '# 任务\n\n## 任务列表\n- [ ] 2.1 实现登录接口 — _需求: FR-1_\n\n## 检查点\n- [ ] 登录可用\n\n## 需求覆盖矩阵\n| 需求 ID | 任务编号 |\n| FR-1 | 2.1 |\n\n## 文件变更清单\n| 文件 | 操作 |\n| src/login.ts | 新建 |\n',
  });
  const good: any = await checkSpec({ feature_name: 'good-feature', project_root: tmp });
  log(`  passed=${good.structuredContent.passed}  errors=${good.structuredContent.errorCount}  FR=${good.structuredContent.frIds.join(',')}`);
  log('  通过文案首行: ' + good.content[0].text.split('\n')[0]);

  fs.rmSync(tmp, { recursive: true, force: true });

  // ④ 工具注解覆盖检查（27 工具应全覆盖）
  hr('④ 工具注解覆盖');
  const names = allToolSchemas.map((t: any) => t.name);
  const missing = names.filter((n: string) => !TOOL_ANNOTATIONS[n]);
  const ro = names.filter((n: string) => TOOL_ANNOTATIONS[n]?.readOnlyHint).length;
  log(`  工具总数: ${names.length}  有注解: ${names.length - missing.length}  缺注解: ${missing.length ? missing.join(', ') : '无 ✓'}`);
  log(`  只读 readOnly: ${ro}  /  写型: ${names.length - ro}`);

  hr('功能校验结束');
}

main().catch((e) => { console.error(e); process.exit(1); });
