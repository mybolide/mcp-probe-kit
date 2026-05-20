import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const listConversationsMock = vi.fn();
const searchHistoryMock = vi.fn();
const readConversationMock = vi.fn();

vi.mock('../../lib/cursor-history-client.js', () => ({
  createCursorHistoryClient: () => ({
    listConversations: listConversationsMock,
    searchHistory: searchHistoryMock,
    readConversation: readConversationMock,
  }),
}));

import { cursorListConversations } from '../cursor_list_conversations.js';
import { cursorSearchConversations } from '../cursor_search_conversations.js';
import { cursorReadConversation } from '../cursor_read_conversation.js';

beforeEach(() => {
  listConversationsMock.mockReset();
  searchHistoryMock.mockReset();
  readConversationMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('cursor history tools', () => {
  test('cursor_list_conversations 返回摘要列表', async () => {
    listConversationsMock.mockResolvedValue([
      { composerId: 'c1', name: '新需求', source: 'composerHeaders' },
    ]);

    const result = await cursorListConversations({ title_query: '新需求', limit: 10 });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.content[0].text).toContain('已获取 1 条 Cursor 会话摘要');
    expect(result.structuredContent.count).toBe(1);
    expect(listConversationsMock).toHaveBeenCalledWith({
      titleQuery: '新需求',
      workspaceQuery: '',
      includeArchived: false,
      limit: 10,
    });
  });

  test('cursor_search_conversations 缺少 query 时返回错误', async () => {
    const result = await cursorSearchConversations({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('缺少必填参数: query');
  });

  test('cursor_search_conversations 返回命中结果', async () => {
    searchHistoryMock.mockResolvedValue([
      { composerId: 'c1', conversationName: '新需求', bubbleId: 'b1', type: 1, text: '我们先聊需求' },
    ]);

    const result = await cursorSearchConversations({ query: '需求', composer_id: 'c1', limit: 5 });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    expect(result.structuredContent.count).toBe(1);
    expect(searchHistoryMock).toHaveBeenCalledWith({
      query: '需求',
      composerId: 'c1',
      limit: 5,
    });
  });

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