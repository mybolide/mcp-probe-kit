#!/usr/bin/env node

/**
 * UI/UX Data Sync Script (Build Time)
 * 
 * 从 npm 包 uipro-cli 提取最新的 UI/UX 数据
 * 并转换为 JSON 格式存储到 src/resources/ui-ux-data/
 * 
 * 这个脚本在构建时运行，将数据内嵌到 npm 包中
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { syncUIDataTo } from '../src/utils/ui-sync.js';
import {
  hasEmbeddedUiData,
  isTransientSyncError,
  resolveSyncTimeoutMs,
} from '../src/utils/ui-sync-build.js';

/**
 * CLI 入口
 */
export async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  
  // 构建时同步到 src/resources/ui-ux-data/
  const outputDir = path.join(process.cwd(), 'src', 'resources', 'ui-ux-data');
  const timeoutMs = resolveSyncTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    await syncUIDataTo(outputDir, verbose, { signal: controller.signal });
  } catch (error) {
    if (hasEmbeddedUiData(outputDir) && isTransientSyncError(error, controller.signal.aborted)) {
      console.warn(
        `[sync-ui-data] 上游同步不可用（${controller.signal.aborted ? `超过 ${timeoutMs}ms` : '网络错误'}），继续使用已内嵌数据。`
      );
      return;
    }
    console.error('Sync failed:', error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
  }
}

// 运行主函数
const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (isDirectRun) {
  void main();
}
