import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveFlutterTestTarget } from '../flutter-gate.js';

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-flutter-gate-'));
  roots.push(root);
  return root;
}
function save(root: string, relative: string, body: string) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
}
function createFlutterPackage(root: string, app: string, test = true) {
  save(root, app + '/pubspec.yaml', [
    'name: scoped_client', 'environment:', "  sdk: '>=3.0.0 <4.0.0'",
    'dependencies:', '  flutter:', '    sdk: flutter', '',
  ].join('\n'));
  if (test) save(root, app + '/test/features/shell/app_test.dart',
    "import 'package:flutter_test/flutter_test.dart';\nvoid main() { test('ok', () {}); }\n");
}
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

describe('Flutter Gate selects the task-scoped real project (never a template)', () => {
  it('targets apps/client instead of hardcoded obsolete apps/mobile', () => {
    const root = fixture();
    createFlutterPackage(root, 'apps/client');
    save(root, 'apps/mobile/README.md', 'Legacy ownership placeholder');
    const target = resolveFlutterTestTarget(root, [
      'apps/client/lib/features/shell/**', 'apps/client/test/features/shell/**',
    ]);
    expect(target).toMatchObject({ passed: true, relativeRoot: 'apps/client', testFiles: 1 });
  });

  it('supports an explicitly scoped legacy Flutter root without project-specific defaults', () => {
    const root = fixture();
    createFlutterPackage(root, 'apps/mobile');
    expect(resolveFlutterTestTarget(root, ['apps/mobile/lib/**', 'apps/mobile/test/**']))
      .toMatchObject({ passed: true, relativeRoot: 'apps/mobile', testFiles: 1 });
  });

  it('rejects claims without frozen allowedPaths or a real Flutter manifest', () => {
    const root = fixture();
    save(root, 'apps/client/test/features/shell/app_test.dart', "test('fake', () {});");
    expect(resolveFlutterTestTarget(root, [])).toMatchObject({ passed: false });
    expect(resolveFlutterTestTarget(root, ['apps/client/test/**']))
      .toMatchObject({ passed: false, error: expect.stringContaining('pubspec.yaml') });
  });

  it('does not accept a symlink to a foreign pubspec.yaml as the project manifest', () => {
    const root = fixture();
    const outside = fixture();
    createFlutterPackage(outside, 'foreign');
    save(root, 'apps/client/test/features/shell/app_test.dart', "test('ok', () {});");
    fs.symlinkSync(path.join(outside, 'foreign/pubspec.yaml'),
      path.join(root, 'apps/client/pubspec.yaml'));
    expect(resolveFlutterTestTarget(root, ['apps/client/**']))
      .toMatchObject({ passed: false, error: expect.stringContaining('pubspec.yaml') });
  });

  it('rejects an empty or fake test suite instead of a vacuous success', () => {
    const root = fixture();
    createFlutterPackage(root, 'apps/client', false);
    save(root, 'apps/client/test/README.md', 'Not a test.');
    expect(resolveFlutterTestTarget(root, ['apps/client/**']))
      .toMatchObject({ passed: false, error: expect.stringContaining('*_test.dart') });
  });

  it('rejects more than one scoped Flutter application', () => {
    const root = fixture();
    createFlutterPackage(root, 'apps/mobile');
    createFlutterPackage(root, 'apps/client');
    expect(resolveFlutterTestTarget(root, ['apps/mobile/**', 'apps/client/**']))
      .toMatchObject({ passed: false, error: expect.stringContaining('Ambiguous') });
  });

  it('does not follow a Flutter application symlink outside the project', () => {
    const root = fixture();
    const outside = fixture();
    createFlutterPackage(outside, 'real-app');
    fs.mkdirSync(path.join(root, 'apps'), { recursive: true });
    fs.symlinkSync(path.join(outside, 'real-app'), path.join(root, 'apps/client'), 'dir');
    expect(resolveFlutterTestTarget(root, ['apps/client/**']))
      .toMatchObject({ passed: false, error: expect.stringContaining('pubspec.yaml') });
  });
});
