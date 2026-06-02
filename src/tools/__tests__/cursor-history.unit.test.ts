import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const readConversationMock = vi.fn();

vi.mock('../../lib/cursor-history-client.js', () => ({
  createCursorHistoryClient: () => ({
    readConversation: readConversationMock,
  }),
}));

import { cursorReadConversation } from '../cursor_read_conversation.js';

beforeEach(() => {
  readConversationMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('cursor history tools', () => {
  test('cursor_read_conversation 返回消息时间线', async () => {
    readConversationMock.mockResolvedValue({
      composerId: 'c1',
      messages: [
        { bubbleId: 'b1', type: 1, text: '我们先聊需求' },
        { bubbleId: 'b2', type: 2, text: '听懂了' },
      ],
    });

    const result = await cursorReadConversation({ composer_id: 'c1', limit: 50, include_empty: true });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('共 2 条消息');
    expect(result.structuredContent.messageCount).toBe(2);
    expect(readConversationMock).toHaveBeenCalledWith({
      composerId: 'c1',
      limit: 50,
      includeEmpty: true,
    });
  });
});
