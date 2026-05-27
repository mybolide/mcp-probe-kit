import { parseArgs, getString, getNumber } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { createMemoryClient } from '../lib/memory-client.js';
import { handleToolError } from '../utils/error-handler.js';

export async function memorizeAsset(args: any) {
  try {
    const parsed = parseArgs<{
      name?: string;
      type?: string;
      description?: string;
      summary?: string;
      content?: string;
      code_snippet?: string;
      file_path?: string;
      source_project?: string;
      source_path?: string;
      usage?: string;
      confidence?: number;
      tags?: string[];
    }>(args, {
      defaultValues: {
        name: '',
        type: 'code',
        description: '',
        summary: '',
        content: '',
        code_snippet: '',
        file_path: '',
        source_project: '',
        source_path: '',
        usage: '',
        confidence: 0.7,
      },
      fieldAliases: {
        code_snippet: ['code', 'snippet'],
        file_path: ['path'],
        source_project: ['project'],
        source_path: ['source'],
      },
    });

    const name = getString(parsed.name);
    const type = getString(parsed.type) || 'code';
    const description = getString(parsed.description);
    const summary = getString(parsed.summary);
    const content = getString(parsed.content) || getString(parsed.code_snippet);
    const sourceProject = getString(parsed.source_project);
    const sourcePath = getString(parsed.source_path) || getString(parsed.file_path);
    const usage = getString(parsed.usage);
    const confidence = getNumber(parsed.confidence, 0.7);
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((item): item is string => typeof item === 'string') : [];

    if (!name || !description || !summary || !content) {
      throw new Error('缺少必填参数: name, description, summary, content/code_snippet');
    }

    const client = createMemoryClient();
    if (!client.isEnabled()) {
      return okStructured(
        '记忆服务未开启，已跳过沉淀。',
        { enabled: false, stored: false }
      );
    }

    const warnings: string[] = [];
    if (type === 'bugfix') {
      const requiredSections = ['【现象】', '【根因】', '【修复】'];
      const missing = requiredSections.filter((section) => !content.includes(section));
      if (missing.length > 0) {
        warnings.push(`建议 content 包含 ${missing.join('、')}，便于跨仓库检索与复用`);
      }
    }
    if (sourceProject || sourcePath) {
      warnings.push(
        '跨仓库共享记忆时请勿依赖 source_project/source_path；路径请写入 content 正文（可选）'
      );
    }

    const asset = await client.upsertAsset({
      name,
      type,
      description,
      summary,
      content,
      sourceProject: sourceProject || undefined,
      sourcePath: sourcePath || undefined,
      usage: usage || undefined,
      confidence,
      tags,
    });

    return okStructured(
      `已沉淀记忆资产: ${asset.name}`,
      {
        enabled: true,
        stored: true,
        asset,
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    );
  } catch (error) {
    return handleToolError(error, 'memorize_asset');
  }
}