import { parseArgs, getString, getNumber } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { createMemoryClient } from '../lib/memory-client.js';
import { handleToolError } from '../utils/error-handler.js';
import { attachHandles, buildMemoryAssetHandles } from '../lib/handles.js';

function fieldProvided(args: any, ...keys: string[]): boolean {
  const record =
    args?.input && typeof args.input === 'object' && !Array.isArray(args.input)
      ? { ...args, ...args.input }
      : args;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return false;
  }
  return keys.some((key) => key in record && record[key] !== undefined && record[key] !== null);
}

export async function updateMemoryAsset(args: any) {
  try {
    const parsed = parseArgs<{
      asset_id?: string;
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
      fieldAliases: {
        code_snippet: ['code', 'snippet'],
        file_path: ['path'],
        source_project: ['project'],
        source_path: ['source'],
      },
    });

    const assetId = getString(parsed.asset_id);
    if (!assetId) {
      throw new Error('缺少必填参数: asset_id');
    }

    const patch: {
      name?: string;
      type?: string;
      description?: string;
      summary?: string;
      content?: string;
      tags?: string[];
      confidence?: number;
      sourceProject?: string;
      sourcePath?: string;
      usage?: string;
    } = {};

    if (fieldProvided(args, 'name')) {
      patch.name = getString(parsed.name);
    }
    if (fieldProvided(args, 'type')) {
      patch.type = getString(parsed.type);
    }
    if (fieldProvided(args, 'description')) {
      patch.description = getString(parsed.description);
    }
    if (fieldProvided(args, 'summary')) {
      patch.summary = getString(parsed.summary);
    }
    if (fieldProvided(args, 'content', 'code_snippet', 'code', 'snippet')) {
      patch.content = getString(parsed.content) || getString(parsed.code_snippet);
    }
    if (fieldProvided(args, 'tags')) {
      patch.tags = Array.isArray(parsed.tags)
        ? parsed.tags.filter((item): item is string => typeof item === 'string')
        : [];
    }
    if (fieldProvided(args, 'confidence')) {
      patch.confidence = getNumber(parsed.confidence, 0.7);
    }
    if (fieldProvided(args, 'usage')) {
      patch.usage = getString(parsed.usage);
    }
    if (fieldProvided(args, 'source_project', 'project')) {
      patch.sourceProject = getString(parsed.source_project);
    }
    if (fieldProvided(args, 'source_path', 'source', 'file_path', 'path')) {
      patch.sourcePath = getString(parsed.source_path) || getString(parsed.file_path);
    }

    if (Object.keys(patch).length === 0) {
      throw new Error('至少提供一个待更新字段: name, type, description, summary, content, tags, confidence, usage 等');
    }

    const client = createMemoryClient();
    if (!client.isEnabled()) {
      return okStructured(
        '记忆服务未开启，已跳过更新。',
        { enabled: false, updated: false, asset: null }
      );
    }

    const warnings: string[] = [];
    const nextType = patch.type;
    const nextContent = patch.content;
    if (nextType === 'bugfix' && nextContent) {
      const requiredSections = ['【现象】', '【根因】', '【修复】'];
      const missing = requiredSections.filter((section) => !nextContent.includes(section));
      if (missing.length > 0) {
        warnings.push(`建议 content 包含 ${missing.join('、')}，便于跨仓库检索与复用`);
      }
    }
    if (patch.sourceProject || patch.sourcePath) {
      warnings.push(
        '跨仓库共享记忆时请勿依赖 source_project/source_path；路径请写入 content 正文（可选）'
      );
    }

    const { updated, asset } = await client.updateAsset(assetId, patch);
    if (!updated || !asset) {
      return okStructured(
        `未找到记忆资产: ${assetId}`,
        { enabled: true, updated: false, asset: null }
      );
    }

    return okStructured(
      `已更新记忆资产: ${asset.name}`,
      attachHandles(
        {
          enabled: true,
          updated: true,
          asset,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
        {
          memory_assets: buildMemoryAssetHandles(
            [{ id: asset.id, name: asset.name, type: asset.type, summary: asset.summary }],
            'update_memory_asset'
          ),
        }
      )
    );
  } catch (error) {
    return handleToolError(error, 'update_memory_asset');
  }
}
