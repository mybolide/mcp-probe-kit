import { parseArgs, getString, getNumber } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { createMemoryClient } from '../lib/memory-client.js';
import { handleToolError } from '../utils/error-handler.js';
import {
  isNegativeMemoryType,
  mergeMemoryTags,
  normalizeOptionalIsoDate,
  normalizeStringArray,
} from '../lib/memory-model.js';
import {
  parseMemoryConflictPolicy,
  parseMemoryStatus,
} from '../lib/memory-quality.js';
import type {
  MemoryAssetWriteInput,
  MemoryWriteOutcome,
} from '../lib/memory-write-operations.js';

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
      evidence?: string[];
      applicability?: string;
      status?: string;
      expires_at?: string;
      supersedes?: string[];
      superseded_by?: string;
      conflict_policy?: string;
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
        applicability: '',
        status: 'active',
        expires_at: '',
        superseded_by: '',
        conflict_policy: 'reject',
      },
      fieldAliases: {
        code_snippet: ['code', 'snippet'],
        file_path: ['path'],
        source_project: ['project'],
        source_path: ['source'],
        applicability: ['applicable_when', 'boundaries', 'limitations'],
        expires_at: ['expiresAt', 'expiry', 'valid_until'],
        superseded_by: ['supersededBy', 'replaced_by'],
        conflict_policy: ['conflictPolicy', 'on_conflict'],
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
    const evidence = normalizeStringArray(parsed.evidence);
    const applicability = getString(parsed.applicability);
    const supersedes = normalizeStringArray(parsed.supersedes);
    const supersededBy = getString(parsed.superseded_by);
    if (supersededBy) {
      throw new Error(
        '新建 Memory 资产不支持 superseded_by。请先创建 successor，再用 update_memory_asset 更新已有旧资产。',
      );
    }
    const status = parseMemoryStatus(getString(parsed.status) || 'active');
    const conflictPolicy = parseMemoryConflictPolicy(parsed.conflict_policy);
    const expiresAt = normalizeOptionalIsoDate(parsed.expires_at, 'expires_at');
    const tags = mergeMemoryTags(
      normalizeStringArray(parsed.tags),
      isNegativeMemoryType(type) ? [type, 'negative-memory'] : []
    );

    if (!name || !description || !summary || !content) {
      throw new Error('缺少必填参数: name, description, summary, content/code_snippet');
    }
    if (isNegativeMemoryType(type) && evidence.length === 0) {
      throw new Error(`${type} 必须提供 evidence，记录失败或证伪依据`);
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
    if (isNegativeMemoryType(type) && !applicability) {
      warnings.push('负面记忆建议提供 applicability，明确适用边界，避免过度泛化');
    }
    if (sourceProject || sourcePath) {
      warnings.push(
        'source_project/source_path 会将资产识别为项目范围；跨项目共享经验请将必要上下文写入 content'
      );
    }

    const writeInput: MemoryAssetWriteInput = {
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
      evidence,
      applicability: applicability || undefined,
      status,
      expiresAt,
      supersedes,
      supersededBy: supersededBy || undefined,
      conflictPolicy,
    };
    const compatibilityClient = client as typeof client & {
      upsertAssetWithQuality?: (
        input: MemoryAssetWriteInput,
      ) => Promise<MemoryWriteOutcome>;
    };
    const outcome = typeof compatibilityClient.upsertAssetWithQuality === 'function'
      ? await compatibilityClient.upsertAssetWithQuality(writeInput)
      : {
          asset: await client.upsertAsset(writeInput),
          disposition: 'created' as const,
          conflicts: [],
          supersededAssetIds: [],
        };
    const { asset } = outcome;
    if (outcome.conflicts.length > 0) {
      warnings.push(
        `检测到同身份资产: ${outcome.conflicts.map((item) => item.assetId).join(', ')}；处理策略=${conflictPolicy}`,
      );
    }

    return okStructured(
      [
        outcome.disposition === 'deduplicated'
          ? `已复用重复记忆资产: ${asset.name}`
          : `已沉淀记忆资产: ${asset.name}`,
        `asset_id: ${asset.id}`,
        `status: ${asset.status || 'active'}`,
        `disposition: ${outcome.disposition}`,
        `下一步读取: read_memory_asset {"asset_id": "${asset.id}"}`,
      ].join('\n'),
      {
        enabled: true,
        stored: outcome.disposition !== 'deduplicated',
        reused: outcome.disposition === 'deduplicated',
        disposition: outcome.disposition,
        asset,
        conflicts: outcome.conflicts,
        supersededAssetIds: outcome.supersededAssetIds,
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    );
  } catch (error) {
    return handleToolError(error, 'memorize_asset');
  }
}