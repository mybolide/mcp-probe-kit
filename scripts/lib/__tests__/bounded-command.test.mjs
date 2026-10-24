import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runBoundedCommand } from '../bounded-command.mjs';

test('bounded command returns stdout for a successful subprocess', () => {
  const result = runBoundedCommand(
    process.execPath,
    ['-e', 'process.stdout.write("ok")'],
    { timeout: 5_000 }
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'ok');
});

test('bounded command closes stdin unless explicitly supplied', () => {
  const result = runBoundedCommand(
    process.execPath,
    ['-e', 'process.stdin.on("end", () => process.stdout.write("closed")); process.stdin.resume();'],
    { timeout: 5_000 }
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'closed');
});

test('bounded command terminates a hung subprocess', () => {
  assert.throws(
    () => runBoundedCommand(
      process.execPath,
      ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'],
      { timeout: 250 }
    ),
    /Command timed out after 250ms/
  );
});

test('bounded command rejects invalid deadlines', () => {
  for (const timeout of [0, -1, Infinity, 1.5]) {
    assert.throws(
      () => runBoundedCommand(process.execPath, ['--version'], { timeout }),
      /timeout must be a positive integer/
    );
  }
});
