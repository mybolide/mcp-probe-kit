import { okStructured } from '../lib/response.js';
import { createMemoryClient } from '../lib/memory-client.js';
import { formatReadMemoryAssetText } from '../lib/memory-orchestration.js';
import { handleToolError } from '../utils/error-handler.js';

export async function readMemoryAsset(args: any) {
  try {
    const assetId = typeof args?.asset_id === 'string' ? args.asset_id.trim() : '';
    if (!assetId) {
      throw new Error('缺少必填参数: asset_id');
    }

    const client = createMemoryClient();
    if (!client.isReadEnabled()) {
      return okStructured(
        '记忆服务未开启，已跳过读取。',
        { enabled: false, asset: null }
      );
    }

    const asset = await client.getAsset(assetId);
    if (!asset) {
      return okStructured(
        `未找到记忆资产: ${assetId}`,
        { enabled: true, asset: null }
      );
    }

    return okStructured(formatReadMemoryAssetText(asset), {
      enabled: true,
      asset,
    });
  } catch (error) {
    return handleToolError(error, 'read_memory_asset');
  }
}