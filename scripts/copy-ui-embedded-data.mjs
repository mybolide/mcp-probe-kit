#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function copyEmbeddedUIData() {
  const projectRoot = process.cwd();
  const srcDir = path.join(projectRoot, 'src', 'resources', 'ui-ux-data');
  const destDir = path.join(projectRoot, 'build', 'resources', 'ui-ux-data');

  if (!fs.existsSync(srcDir)) {
    console.warn(`[copy-ui-embedded-data] source not found: ${srcDir}`);
    return;
  }

  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.cpSync(srcDir, destDir, { recursive: true, force: true });
  console.log(`[copy-ui-embedded-data] copied to ${destDir}`);
}

copyEmbeddedUIData();
