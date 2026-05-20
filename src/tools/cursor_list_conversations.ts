import { parseArgs, getString, getNumber, getBoolean } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { handleToolError } from '../utils/error-handler.js';
import { createCursorHistoryClient } from '../lib/cursor-history-client.js';

export async function cursorListConversations(args: any) {
  try {
    const parsed = parseArgs<{
      title_query?: string;
      workspace_query?: string;
      include_archived?: boolean;
      limit?: number;
    }>(args, {
      defaultValues: {
        title_query: '',
        workspace_query: '',
        include_archived: false,
        limit: 20,
      },
      fieldAliases: {
        title_query: ['title', 'name_query', 'query'],
        workspace_query: ['workspace', 'workspace_path'],
        include_archived: ['archived'],
      },
    });

    const client = createCursorHistoryClient();
    const conversations = await client.listConversations({
      titleQuery: getString(parsed.title_query),
      workspaceQuery: getString(parsed.workspace_query),
      includeArchived: getBoolean(parsed.include_archived, false),
      limit: getNumber(parsed.limit, 20),
    });

    return okStructured(
      `已获取 ${conversations.length} 条 Cursor 会话摘要。`,
      {
        count: conversations.length,
        conversations,
      }
    );
  } catch (error) {
    return handleToolError(error, 'cursor_list_conversations');
  }
}