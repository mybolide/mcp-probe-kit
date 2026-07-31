import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const isReadEnabledMock = vi.fn();
const listAssetsMock = vi.fn();

vi.mock('../../lib/memory-client.js', () => ({
  createMemoryClient: () => ({
    isReadEnabled: isReadEnabledMock,
    listAssets: listAssetsMock,
  }),
}));

import { listMemoryAssets } from '../list_memory_assets.js';

beforeEach(() => {
  isReadEnabledMock.mockReset();
  listAssetsMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('list_memory_assets app-only action', () => {
  test('returns an empty disabled state when Memory is not configured', async () => {
    isReadEnabledMock.mockReturnValue(false);
    const result = await listMemoryAssets({ limit: 10 });
    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) throw new Error('missing structuredContent');
    expect(result.structuredContent).toEqual({
      enabled: false,
      items: [],
      total: 0,
    });
    expect(listAssetsMock).not.toHaveBeenCalled();
  });

  test('returns summary records without embedding full memory content in the list', async () => {
    isReadEnabledMock.mockReturnValue(true);
    listAssetsMock.mockResolvedValue({
      items: [
        {
          id: 'asset-1',
          name: 'Proxy repair',
          type: 'bugfix',
          description: 'HTTPS proxy mismatch',
          summary: 'Use the correct proxy protocol',
          content: 'large private implementation body',
          tags: ['proxy', 'bugfix'],
          confidence: 0.9,
          status: 'active',
          sourceProject: 'acme/api',
          evidence: ['regression-test'],
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-30T00:00:00.000Z',
        },
      ],
      total: 1,
    });

    const result = await listMemoryAssets({
      limit: 20,
      offset: 0,
      include_inactive: true,
      source_project: 'acme/api',
    });

    expect(listAssetsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
        includeInactive: true,
        sourceProject: 'acme/api',
      }),
    );
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) throw new Error('missing structuredContent');
    expect(result.structuredContent).toMatchObject({
      enabled: true,
      total: 1,
      items: [
        {
          id: 'asset-1',
          name: 'Proxy repair',
          status: 'active',
          sourceProject: 'acme/api',
        },
      ],
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain(
      'large private implementation body',
    );
  });
});
