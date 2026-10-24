/** Resolve the real Flutter test package from the frozen task scope.
 * Never substitute an unrelated demo app for the project's approved client.
 */
import fs from 'node:fs';
import path from 'node:path';

export type FlutterTestTarget =
  | { passed: true; appRoot: string; relativeRoot: string; testFiles: number }
  | { passed: false; error: string };

function flutterTestFiles(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) count += flutterTestFiles(entryPath);
    else if (entry.isFile() && entry.name.endsWith('_test.dart')) count++;
  }
  return count;
}

export function resolveFlutterTestTarget(projectRoot: string, allowedPaths: string[]): FlutterTestTarget {
  if (!Array.isArray(allowedPaths) || !allowedPaths.length) {
    return { passed: false, error: 'Flutter gate requires the task frozen allowedPaths' };
  }
  const root = fs.realpathSync(projectRoot);
  const candidates = new Map<string, { appRoot: string; relativeRoot: string }>();
  for (const scope of allowedPaths) {
    if (typeof scope !== 'string' || scope.startsWith('/') || scope.split('/').includes('..')) {
      continue;
    }
    const segments = scope.split('/');
    const wildcard = segments.findIndex(segment => segment.includes('*'));
    const fixed = wildcard === -1 ? segments : segments.slice(0, wildcard);
    if (!fixed.length) continue;
    let current = path.join(root, ...fixed);
    if (wildcard === -1 && !fs.existsSync(current)) current = path.dirname(current);
    if (wildcard === -1 && fs.existsSync(current) && fs.statSync(current).isFile()) {
      current = path.dirname(current);
    }
    while (current.startsWith(root + path.sep) || current === root) {
      const pubspec = path.join(current, 'pubspec.yaml');
      if (fs.existsSync(pubspec)) {
        const realApp = fs.realpathSync(current);
        if (realApp === current &&
          (realApp === root || realApp.startsWith(root + path.sep)) &&
          fs.lstatSync(pubspec).isFile()) {
          const content = fs.readFileSync(pubspec, 'utf8');
          if (/^\s*flutter:\s*$/m.test(content) && /^\s*sdk:\s*flutter\s*$/m.test(content)) {
            candidates.set(realApp, {
              appRoot: realApp, relativeRoot: path.relative(root, realApp) || '.',
            });
          }
        }
      }
      if (current === root) break;
      current = path.dirname(current);
    }
  }
  if (!candidates.size) return {
    passed: false,
    error: 'No actual Flutter pubspec.yaml within the frozen task paths; no substitute app accepted',
  };
  if (candidates.size !== 1) return {
    passed: false,
    error: 'Ambiguous Flutter packages in task scope: ' +
      [...candidates.values()].map(candidate => candidate.relativeRoot).join(', '),
  };
  const target = [...candidates.values()][0];
  const testsDir = path.join(target.appRoot, 'test');
  if (!fs.existsSync(testsDir) || !fs.statSync(testsDir).isDirectory() ||
    fs.realpathSync(testsDir) !== testsDir) {
    return { passed: false, error: 'Real Flutter test directory missing or not local: ' +
      target.relativeRoot };
  }
  const testFiles = flutterTestFiles(testsDir);
  if (!testFiles) return {
    passed: false, error: 'No executable *_test.dart cases in Flutter package: ' +
      target.relativeRoot,
  };
  return { passed: true, ...target, testFiles };
}
