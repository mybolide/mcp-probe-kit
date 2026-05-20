import { parseArgs, getString, getNumber, getBoolean } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { handleToolError } from '../utils/error-handler.js';
import { createCursorHistoryClient } from '../lib/cursor-history-client.js';

export async function cursorReadConversation(args: any) {
  try {
    const parsed = parseArgs<{
      composer_id?: string;
      limit?: number;
      include_empty?: boolean;
    }>(args, {
      defaultValues: {
        composer_id: '',
        limit: 200,
        include_empty: false,
      },
      fieldAliases: {
        composer_id: ['conversation_id', 'chat_id'],
      },
    });

    const composerId = getString(parsed.composer_id).trim();
    if (!composerId) {
      throw new Error('缺少必填参数: composer_id');
    }

    const client = createCursorHistoryClient();
    const conversation = await client.readConversation({
      composerId,
      limit: getNumber(parsed.limit, 200),
      includeEmpty: getBoolean(parsed.include_empty, false),
    });

    return okStructured(
      `已读取 Cursor 会话 ${composerId}，共 ${conversation.messages.length} 条消息。`,
      {
        composerId,
        messageCount: conversation.messages.length,
        conversation,
      }
    );
  } catch (error) {
    return handleToolError(error, 'cursor_read_conversation');
  }
}