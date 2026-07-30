export * from './src8-guidance.js';
export * from './src8-plan.js';
export * from './src8-prompt.js';

import { renderFixBugPromptBody } from './src8-prompt.js';

/** @deprecated 使用 renderFixBugPromptBody */
export const renderTbpBugInfoSections = renderFixBugPromptBody;
