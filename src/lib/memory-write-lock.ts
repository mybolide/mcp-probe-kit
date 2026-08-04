const identityLocks = new Map<string, Promise<void>>();

export async function withMemoryIdentityLock<T>(
  identityKey: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = identityLocks.get(identityKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  identityLocks.set(identityKey, queued);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (identityLocks.get(identityKey) === queued) {
      identityLocks.delete(identityKey);
    }
  }
}
