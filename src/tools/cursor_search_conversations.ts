import { parseArgs, getString, getNumber } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { handleToolError } from '../utils/error-handler.js';
import { createCursorHistoryClient } from '../lib/cursor-history-client.js';

export async function cursorSearchConversations(args: any) {
  try {
    const parsed = parseArgs<{
      query?: string;
      composer_id?: string;
      limit?: number;
    }>(args, {
      defaultValues: {
        query: '',
        composer_id: '',
        limit: 20,
      },
      primaryField: 'query',
      fieldAliases: {
        composer_id: ['conversation_id', 'chat_id'],
      },
    });

    const query = getString(parsed.query).trim();
    if (!query) {
      throw new Error('缺少必填参数: query');
    }

    const client = createCursorHistoryClient();
    const matches = await client.searchHistory({
      query,
      composerId: getString(parsed.composer_id),
      limit: getNumber(parsed.limit, 20),
    });

    return okStructured(
      `已找到 ${matches.length} 条 Cursor 历史命中。`,
      {
        count: matches.length,
        matches,
      }
    );
  } catch (error) {
    return handleToolError(error, 'cursor_search_conversations');
  }
}