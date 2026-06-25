import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  resolveBugfixFeatureName,
  resolveBugfixSpecGate,
  specArtifactsExist,
} from '../spec-gate.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function makeSpecTree(featureName: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-gate-'));
  tempDirs.push(root);
  const specDir = path.join(root, 'docs', 'specs', featureName);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'requirements.md'), '# requirements\n');
  return root;
}

describe('spec-gate', () => {
  test('显式 feature_name 优先', () => {
    const root = makeSpecTree('user-auth');
    expect(resolveBugfixFeatureName('payment', root, 'docs', 'user-auth login failed')).toBe('payment');
  });

  test('仅一个 spec 目录时自动识别', () => {
    const root = makeSpecTree('only-feature');
    expect(resolveBugfixFeatureName('', root, 'docs', 'random error')).toBe('only-feature');
  });

  test('错误描述唯一匹配 spec 目录', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-gate-'));
    tempDirs.push(root);
    for (const name of ['user-auth', 'billing']) {
      const specDir = path.join(root, 'docs', 'specs', name);
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, 'tasks.md'), '# tasks\n');
    }
    expect(resolveBugfixFeatureName('', root, 'docs', 'billing invoice total mismatch')).toBe('billing');
  });

  test('resolveBugfixSpecGate 在规格存在时返回上下文', () => {
    const root = makeSpecTree('checkout-flow');
    const gate = resolveBugfixSpecGate({
      featureName: 'checkout-flow',
      projectRoot: root,
      docsDir: 'docs',
      hintText: 'checkout failed',
    });
    expect(gate?.featureName).toBe('checkout-flow');
    expect(gate?.specDir).toBe('docs/specs/checkout-flow');
    expect(specArtifactsExist(root, 'docs', 'checkout-flow')).toBe(true);
  });
});
