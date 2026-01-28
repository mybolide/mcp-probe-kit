import { genPrd } from "./gen_prd.js";
import { genPrototype } from "./gen_prototype.js";
import { initProjectContext } from "./init_project_context.js";
import { uiDesignSystem } from "./ui-ux-tools.js";
import { promises as fs } from "fs";
import path from "path";

interface StartProductInput {
  description: string;
  product_name?: string;
  product_type?: string;
  skip_design_system?: boolean;
  docs_dir?: string;
}

interface StartProductOutput {
  success: boolean;
  message: string;
  data: {
    steps_completed: string[];
    files_generated: {
      prd: string;
      prototype_index: string;
      prototype_pages: string[];
      design_system?: string;
      html_prototypes: string[];
      html_index: string;
    };
  };
}

interface PageInfo {
  name: string;
  path: string;
  type: string;
  description: string;
}

async function extractPagesFromPrototype(prototypeDir: string): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];
  const files = await fs.readdir(prototypeDir);
  
  for (const file of files) {
    if (file.startsWith('page-') && file.endsWith('.md')) {
      const filePath = path.join(prototypeDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const nameMatch = content.match(/# 页面原型 - (.+)/);
      const pathMatch = content.match(/\*\*页面路径\*\*: (.+)/);
      const typeMatch = content.match(/\*\*页面类型\*\*: (.+)/);
      const descMatch = content.match(/\*\*页面说明\*\*: (.+)/);
      if (nameMatch) {
        pages.push({
          name: nameMatch[1].trim(),
          path: pathMatch ? pathMatch[1].trim() : '/',
          type: typeMatch ? typeMatch[1].trim() : '页面',
          description: descMatch ? descMatch[1].trim() : '',
        });
      }
    }
  }
  return pages;
}

function generateHtmlPrototype(page: PageInfo, designSystem: any, allPages: PageInfo[]): string {
  const colors = designSystem?.colors || { primary: '#3B82F6', secondary: '#10B981', background: '#FFFFFF', text: '#1F2937' };
  const navLinks = allPages.map(p => {
    const fileName = 'page-' + p.name.replace(/\s+/g, '-').toLowerCase() + '.html';
    const isActive = p.name === page.name;
    return '<a href="' + fileName + '" class="' + (isActive ? 'active' : '') + '">' + p.name + '</a>';
  }).join('\n          ');
  
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>' + page.name + ' - 产品原型</title>\n  <style>\n    * { margin: 0; padding: 0; box-sizing: border-box; }\n    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: ' + colors.text + '; background-color: ' + colors.background + '; line-height: 1.6; }\n    header { background-color: ' + colors.primary + '; color: white; padding: 1rem 2rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }\n    header .container { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }\n    header .logo { font-size: 1.5rem; font-weight: bold; }\n    header nav a { color: white; text-decoration: none; margin-left: 2rem; padding: 0.5rem 1rem; border-radius: 4px; transition: background-color 0.3s; }\n    header nav a:hover, header nav a.active { background-color: rgba(255,255,255,0.2); }\n    main { max-width: 1200px; margin: 2rem auto; padding: 0 2rem; }\n    .hero { text-align: center; padding: 4rem 2rem; background: linear-gradient(135deg, ' + colors.primary + '15 0%, ' + colors.secondary + '15 100%); border-radius: 8px; margin-bottom: 3rem; }\n    .hero h1 { font-size: 2.5rem; margin-bottom: 1rem; color: ' + colors.primary + '; }\n    .hero p { font-size: 1.25rem; color: ' + colors.text + '; opacity: 0.8; margin-bottom: 2rem; }\n    .hero .cta-button { display: inline-block; background-color: ' + colors.primary + '; color: white; padding: 1rem 2rem; border-radius: 8px; text-decoration: none; font-weight: 600; }\n    .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin-top: 2rem; }\n    .card { background: white; border: 1px solid #E5E7EB; border-radius: 8px; padding: 2rem; }\n    .card h3 { color: ' + colors.primary + '; margin-bottom: 1rem; }\n    footer { background-color: #F9FAFB; padding: 2rem; text-align: center; margin-top: 4rem; border-top: 1px solid #E5E7EB; }\n  </style>\n</head>\n<body>\n  <header>\n    <div class="container">\n      <div class="logo">产品原型</div>\n      <nav>' + navLinks + '</nav>\n    </div>\n  </header>\n  <main>\n    <div class="hero">\n      <h1>' + page.name + '</h1>\n      <p>' + page.description + '</p>\n      <a href="#" class="cta-button">开始使用</a>\n    </div>\n    <div class="card-grid">\n      <div class="card"><h3>功能模块 1</h3><p>功能描述</p></div>\n      <div class="card"><h3>功能模块 2</h3><p>功能描述</p></div>\n      <div class="card"><h3>功能模块 3</h3><p>功能描述</p></div>\n    </div>\n  </main>\n  <footer><p>&copy; 2026 产品原型 | 由 mcp-probe-kit 生成</p></footer>\n  <script>\n    document.querySelectorAll(\'.cta-button\').forEach(button => {\n      button.addEventListener(\'click\', (e) => { e.preventDefault(); alert(\'这是原型演示\'); });\n    });\n  </script>\n</body>\n</html>';
}

function generateHtmlIndex(pages: PageInfo[], designSystem: any): string {
  const colors = designSystem?.colors || { primary: '#3B82F6', secondary: '#10B981', text: '#1F2937' };
  const pageCards = pages.map(page => {
    const fileName = 'page-' + page.name.replace(/\s+/g, '-').toLowerCase() + '.html';
    return '<div class="page-card"><h3>' + page.name + '</h3><p class="page-type">' + page.type + '</p><p class="page-desc">' + page.description + '</p><a href="' + fileName + '" class="view-button">查看原型</a></div>';
  }).join('\n');
  
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>产品原型索引</title>\n  <style>\n    * { margin: 0; padding: 0; box-sizing: border-box; }\n    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: linear-gradient(135deg, ' + colors.primary + '10 0%, ' + colors.secondary + '10 100%); min-height: 100vh; padding: 2rem; }\n    .container { max-width: 1200px; margin: 0 auto; }\n    header { text-align: center; margin-bottom: 3rem; }\n    header h1 { font-size: 3rem; color: ' + colors.primary + '; margin-bottom: 1rem; }\n    .page-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 2rem; }\n    .page-card { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }\n    .page-card h3 { font-size: 1.5rem; color: ' + colors.primary + '; margin-bottom: 0.5rem; }\n    .page-type { display: inline-block; background-color: ' + colors.secondary + '20; color: ' + colors.secondary + '; padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.875rem; margin-bottom: 1rem; }\n    .page-desc { color: ' + colors.text + '; opacity: 0.7; margin-bottom: 1.5rem; }\n    .view-button { display: inline-block; background-color: ' + colors.primary + '; color: white; padding: 0.75rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600; }\n    footer { text-align: center; margin-top: 4rem; padding-top: 2rem; border-top: 1px solid #E5E7EB; opacity: 0.6; }\n  </style>\n</head>\n<body>\n  <div class="container">\n    <header><h1>🎨 产品原型索引</h1><p>共 ' + pages.length + ' 个页面原型</p></header>\n    <div class="page-grid">' + pageCards + '</div>\n    <footer><p>&copy; 2026 产品原型 | 由 mcp-probe-kit 生成</p></footer>\n  </div>\n</body>\n</html>';
}

async function updateProjectContext(prdPath: string, prototypeIndexPath: string, htmlIndexPath: string, designSystemPath?: string): Promise<void> {
  try {
    const contextPath = "docs/project-context.md";
    try { await fs.access(contextPath); } catch { return; }
    let content = await fs.readFile(contextPath, "utf-8");
    if (!content.includes("## 产品设计")) {
      content += '\n\n## 产品设计\n\n### 产品需求文档（PRD）\n- [产品需求文档](../' + prdPath + ')\n\n### 原型设计\n- [原型设计索引](../' + prototypeIndexPath + ')\n- [HTML 原型演示](../' + htmlIndexPath + ')\n' + (designSystemPath ? '\n### 设计系统\n- [设计系统](../' + designSystemPath + ')\n' : '');
      await fs.writeFile(contextPath, content, "utf-8");
    }
  } catch (error) {
    console.warn('Warning: Failed to update project context:', error);
  }
}

export async function startProduct(input: StartProductInput): Promise<StartProductOutput> {
  const stepsCompleted: string[] = [];
  const filesGenerated: StartProductOutput['data']['files_generated'] = {
    prd: '', prototype_index: '', prototype_pages: [], html_prototypes: [], html_index: '',
  };
  
  try {
    if (!input.description || input.description.trim() === "") {
      return { success: false, message: "缺少必需参数：description", data: { steps_completed: [], files_generated: filesGenerated } };
    }
    
    const docsDir = input.docs_dir || "docs";
    
    console.log("📋 步骤 1/6: 检查项目上下文...");
    try {
      await fs.access(path.join(docsDir, "project-context.md"));
      stepsCompleted.push("检查项目上下文（已存在）");
    } catch {
      await initProjectContext({ docs_dir: docsDir });
      stepsCompleted.push("创建项目上下文");
    }
    
    console.log("📝 步骤 2/6: 生成 PRD...");
    const prdResult = await genPrd({ description: input.description, product_name: input.product_name, docs_dir: docsDir });
    if (!prdResult.success) throw new Error('生成 PRD 失败：' + prdResult.message);
    filesGenerated.prd = prdResult.data.prd_path;
    stepsCompleted.push("生成 PRD 文档");
    
    console.log("🎨 步骤 3/6: 生成原型文档...");
    const prototypeResult = await genPrototype({ prd_path: prdResult.data.prd_path, docs_dir: docsDir });
    if (!prototypeResult.success) throw new Error('生成原型文档失败：' + prototypeResult.message);
    filesGenerated.prototype_index = prototypeResult.data.index_path;
    filesGenerated.prototype_pages = prototypeResult.data.page_paths;
    stepsCompleted.push('生成原型文档（' + prototypeResult.data.page_count + ' 个页面）');
    
    let designSystem: any = null;
    if (!input.skip_design_system) {
      console.log("🎨 步骤 4/6: 生成设计系统...");
      const designSystemResult = await uiDesignSystem({ product_type: input.product_type || 'SaaS', description: input.description }) as any;
      if (designSystemResult && designSystemResult.success) {
        filesGenerated.design_system = designSystemResult.data.design_system_path;
        stepsCompleted.push("生成设计系统");
        try {
          const designSystemPath = path.join(docsDir, "design-system", "design-system.json");
          const designSystemContent = await fs.readFile(designSystemPath, 'utf-8');
          designSystem = JSON.parse(designSystemContent);
        } catch (error) {
          console.warn("Warning: Failed to read design system:", error);
        }
      }
    } else {
      stepsCompleted.push("跳过设计系统生成");
    }
    
    console.log("🌐 步骤 5/6: 生成 HTML 原型...");
    const htmlDir = path.join(docsDir, "html-prototype");
    await fs.mkdir(htmlDir, { recursive: true });
    const prototypeDir = path.join(docsDir, "prototype");
    const pages = await extractPagesFromPrototype(prototypeDir);
    
    for (const page of pages) {
      const fileName = 'page-' + page.name.replace(/\s+/g, '-').toLowerCase() + '.html';
      const filePath = path.join(htmlDir, fileName);
      const htmlContent = generateHtmlPrototype(page, designSystem, pages);
      await fs.writeFile(filePath, htmlContent, 'utf-8');
      filesGenerated.html_prototypes.push(filePath);
    }
    
    const indexPath = path.join(htmlDir, "index.html");
    const indexContent = generateHtmlIndex(pages, designSystem);
    await fs.writeFile(indexPath, indexContent, 'utf-8');
    filesGenerated.html_index = indexPath;
    stepsCompleted.push('生成 HTML 原型（' + pages.length + ' 个页面 + 索引页）');
    
    console.log("📚 步骤 6/6: 更新项目上下文...");
    await updateProjectContext(filesGenerated.prd, filesGenerated.prototype_index, filesGenerated.html_index, filesGenerated.design_system);
    stepsCompleted.push("更新项目上下文索引");
    
    const summary = '✅ 产品设计工作流完成！\n\n📊 完成的步骤：\n' + stepsCompleted.map((step, i) => (i + 1) + '. ' + step).join('\n') + '\n\n📁 生成的文件：\n- PRD 文档：' + filesGenerated.prd + '\n- 原型索引：' + filesGenerated.prototype_index + '\n- 原型页面：' + filesGenerated.prototype_pages.length + ' 个\n' + (filesGenerated.design_system ? '- 设计系统：' + filesGenerated.design_system + '\n' : '') + '- HTML 原型：' + filesGenerated.html_prototypes.length + ' 个页面\n- HTML 索引：' + filesGenerated.html_index + '\n\n**🎉 可以直接在浏览器中打开 HTML 原型查看效果！**\n\n打开方式：\n1. 在浏览器中打开：' + filesGenerated.html_index + '\n2. 或使用本地服务器：npx serve ' + path.dirname(filesGenerated.html_index) + '\n\n**下一步建议：**\n1. 在浏览器中查看 HTML 原型，与团队评审\n2. 根据反馈调整原型文档和设计系统\n3. 使用 start_ui 工具开始实际开发';
    
    return {
      success: true,
      message: summary,
      data: { steps_completed: stepsCompleted, files_generated: filesGenerated },
    };
    
  } catch (error) {
    return {
      success: false,
      message: '产品设计工作流执行失败：' + error + '\n\n已完成的步骤：\n' + stepsCompleted.map((step, i) => (i + 1) + '. ' + step).join('\n'),
      data: { steps_completed: stepsCompleted, files_generated: filesGenerated },
    };
  }
}
