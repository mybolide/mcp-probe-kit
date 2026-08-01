#!/usr/bin/env node
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
rmSync(buildDir, { recursive: true, force: true });
console.log(`[clean-build] removed ${buildDir}`);
