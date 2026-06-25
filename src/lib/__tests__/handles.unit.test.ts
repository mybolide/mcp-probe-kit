import { describe, expect, test } from 'vitest';
import {
  attachHandles,
  buildMemoryAssetHandles,
  mergeHandles,
} from '../../lib/handles.js';

describe('handles', () => {
  test('buildMemoryAssetHandles 生成 read 默认工具名', () => {
    const handles = buildMemoryAssetHandles([{ id: 'a-1', name: 'demo' }]);
    expect(handles).toEqual([{ id: 'a-1', name: 'demo', tool: 'read_memory_asset' }]);
  });

  test('attachHandles 合并已有 handles', () => {
    const result = attachHandles(
      { handles: { graph_resource: 'probe://graph/latest' } },
      { memory_assets: buildMemoryAssetHandles([{ id: 'x' }]) }
    );

    expect(result.handles.graph_resource).toBe('probe://graph/latest');
    expect(result.handles.memory_assets).toHaveLength(1);
  });

  test('mergeHandles 后者覆盖 graph 字段', () => {
    expect(
      mergeHandles({ graph_resource: 'a' }, { graph_resource: 'b', graph_snapshot: 'probe://graph/s1' })
    ).toEqual({
      graph_resource: 'b',
      graph_snapshot: 'probe://graph/s1',
    });
  });
});
