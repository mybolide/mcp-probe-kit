import { parseArgs, getString, getNumber } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { createMemoryClient } from '../lib/memory-client.js';
import { handleToolError } from '../utils/error-handler.js';
import { attachHandles, buildMemoryAssetHandles } from '../lib/handles.js';
import {
  isNegativeMemoryType,
  mergeMemoryTags,
  normalizeOptionalIsoDate,
  normalizeStringArray,
  type MemoryStatus,
} from '../lib/memory-model.js';
import {
  parseMemoryConflictPolicy,
  parseMemoryStatus,
} from '../lib/memory-quality.js';
import { assertNoProjectScopedMemoryFields } from '../lib/memory-persistence-guidance.js';

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
      evidence?: string[];
      applicability?: string;
      status?: string;
      expires_at?: string;
      supersedes?: string[];
      superseded_by?: string;
      conflict_policy?: string;
    }>(args, {
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
      evidence?: string[];
      applicability?: string;
      status?: MemoryStatus;
      expiresAt?: string | null;
      supersedes?: string[];
      supersededBy?: string;
      conflictPolicy?: 'reject' | 'supersede' | 'allow_parallel';
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
      patch.tags = normalizeStringArray(parsed.tags);
    }
    if (fieldProvided(args, 'confidence')) {
      patch.confidence = getNumber(parsed.confidence, 0.7);
    }
    if (fieldProvided(args, 'usage')) {
      patch.usage = getString(parsed.usage);
    }
    assertNoProjectScopedMemoryFields({
      sourceProject: fieldProvided(args, 'source_project', 'project')
        ? getString(parsed.source_project)
        : undefined,
      sourcePath: fieldProvided(args, 'source_path', 'source')
        ? getString(parsed.source_path)
        : undefined,
      filePath: fieldProvided(args, 'file_path', 'path')
        ? getString(parsed.file_path)
        : undefined,
    });
    if (fieldProvided(args, 'evidence')) {
      patch.evidence = normalizeStringArray(parsed.evidence);
    }
    if (fieldProvided(args, 'applicability', 'applicable_when', 'boundaries', 'limitations')) {
      patch.applicability = getString(parsed.applicability);
    }
    if (fieldProvided(args, 'status')) {
      patch.status = parseMemoryStatus(getString(parsed.status));
    }
    if (fieldProvided(args, 'expires_at', 'expiresAt', 'expiry', 'valid_until')) {
      const rawExpiresAt = getString(parsed.expires_at);
      patch.expiresAt = rawExpiresAt
        ? normalizeOptionalIsoDate(rawExpiresAt, 'expires_at')
        : null;
    }
    if (fieldProvided(args, 'supersedes')) {
      patch.supersedes = normalizeStringArray(parsed.supersedes);
    }
    if (fieldProvided(args, 'superseded_by', 'supersededBy', 'replaced_by')) {
      patch.supersededBy = getString(parsed.superseded_by);
      if (!fieldProvided(args, 'status') && patch.supersededBy) {
        patch.status = 'superseded';
      }
    }
    if (fieldProvided(args, 'conflict_policy', 'conflictPolicy', 'on_conflict')) {
      patch.conflictPolicy = parseMemoryConflictPolicy(parsed.conflict_policy);
    }

    if (patch.type && isNegativeMemoryType(patch.type)) {
      patch.tags = mergeMemoryTags(patch.tags ?? [], [patch.type, 'negative-memory']);
      if ((patch.evidence?.length ?? 0) === 0) {
        throw new Error(`${patch.type} 的 evidence 不能为空`);
      }
    }

    if (Object.keys(patch).length === 0) {
      throw new Error('至少提供一个待更新字段: name, type, description, summary, content, tags, confidence, evidence, status 等');
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

    const outcome = await client.updateAsset(assetId, patch);
    const { updated, asset } = outcome;
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
          disposition: outcome.disposition,
          conflicts: outcome.conflicts,
          supersededAssetIds: outcome.supersededAssetIds,
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
