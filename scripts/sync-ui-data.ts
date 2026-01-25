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
import { syncUIDataTo } from '../src/utils/ui-sync.js';

/**
 * CLI 入口
 */
async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  
  // 构建时同步到 src/resources/ui-ux-data/
  const outputDir = path.join(process.cwd(), 'src', 'resources', 'ui-ux-data');
  
  try {
    await syncUIDataTo(outputDir, verbose);
    process.exit(0);
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

// 运行主函数
main();
