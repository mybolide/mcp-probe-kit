import { okStructured } from '../lib/response.js';
import { createMemoryClient } from '../lib/memory-client.js';
import { handleToolError } from '../utils/error-handler.js';
import { attachHandles, buildMemoryAssetHandles } from '../lib/handles.js';

function isConfirmTrue(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export async function deleteMemoryAsset(args: any) {
  try {
    const assetId = typeof args?.asset_id === 'string' ? args.asset_id.trim() : '';
    if (!assetId) {
      throw new Error('缺少必填参数: asset_id');
    }

    const confirm = isConfirmTrue(args?.confirm);

    const client = createMemoryClient();
    if (!client.isReadEnabled()) {
      return okStructured(
        '记忆服务未开启，已跳过删除。',
        { enabled: false, deleted: false, asset: null }
      );
    }

    if (!confirm) {
      const existing = await client.getAsset(assetId);
      if (!existing) {
        return okStructured(
          `未找到记忆资产: ${assetId}`,
          attachHandles(
            { enabled: true, deleted: false, requires_confirmation: false, asset: null },
            { memory_assets: buildMemoryAssetHandles([{ id: assetId }], 'delete_memory_asset') }
          )
        );
      }

      return okStructured(
        `待确认删除记忆资产: ${existing.name}。请先用 read_memory_asset 核对内容，确认后带 confirm: true 重新调用 delete_memory_asset。`,
        attachHandles(
          {
            enabled: true,
            deleted: false,
            requires_confirmation: true,
            preview: {
              id: existing.id,
              name: existing.name,
              type: existing.type,
              summary: existing.summary,
            },
            asset: null,
          },
          {
            memory_assets: buildMemoryAssetHandles(
              [{ id: existing.id, name: existing.name, type: existing.type, summary: existing.summary }],
              'delete_memory_asset'
            ),
          }
        )
      );
    }

    const { deleted, asset } = await client.deleteAsset(assetId);
    if (!deleted) {
      return okStructured(
        `未找到记忆资产: ${assetId}`,
        attachHandles(
          { enabled: true, deleted: false, requires_confirmation: false, asset: null },
          { memory_assets: buildMemoryAssetHandles([{ id: assetId }], 'delete_memory_asset') }
        )
      );
    }

    return okStructured(
      `已删除记忆资产: ${asset?.name ?? assetId}`,
      attachHandles(
        {
          enabled: true,
          deleted: true,
          requires_confirmation: false,
          asset,
        },
        asset
          ? {
              memory_assets: buildMemoryAssetHandles(
                [{ id: asset.id, name: asset.name, type: asset.type, summary: asset.summary }],
                'delete_memory_asset'
              ),
            }
          : {}
      )
    );
  } catch (error) {
    return handleToolError(error, 'delete_memory_asset');
  }
}
