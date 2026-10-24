import { spawnSync } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BUFFER = 4 * 1024 * 1024;

/**
 * Bound external commands invoked by release and acceptance smoke tests.
 * Non-interactive stdin and an explicit process deadline prevent a missing
 * network response or a child waiting for input from hanging the whole gate.
 */
export function runBoundedCommand(command, args, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new TypeError('bounded command timeout must be a positive integer');
  }

  const result = spawnSync(command, args, {
    windowsHide: true,
    encoding: 'utf8',
    input: '',
    maxBuffer: DEFAULT_MAX_BUFFER,
    killSignal: 'SIGKILL',
    ...options,
    timeout,
  });

  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error(
      `Command timed out after ${timeout}ms: ${command} ${args.join(' ')}`
    );
  }
  return result;
}
