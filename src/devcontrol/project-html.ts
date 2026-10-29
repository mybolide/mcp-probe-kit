/**
 * Single-project, read-only DevControl workbench.
 * Source lives in ./workbench/{page.html,styles.css,app.js,router.js}.
 * Compiled into one CSP-safe HTML response: no runtime bundler or UI framework.
 */
import { enUi, type WorkbenchLocale } from './i18n.js';
import { workbenchMarkup, workbenchCSS, workbenchJS } from './workbench/generated.js';

export function projectHtml(nonce: string, locale: WorkbenchLocale = 'zh-CN'): string {
  const script = workbenchJS.replaceAll('__LOCALE__', locale)
    .replaceAll('__TRANSLATIONS__', JSON.stringify(enUi));
  return workbenchMarkup
    .replaceAll('__LOCALE__', locale)
    .replaceAll('__NONCE__', nonce)
    .replace('__STYLES__', workbenchCSS)
    .replace('__SCRIPT__', script);
}
