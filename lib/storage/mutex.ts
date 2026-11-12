let chain: Promise<unknown> = Promise.resolve();

// One Node process applies sheet writes in order. Google Sheets has no row locks.
export function serializeSheets<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
