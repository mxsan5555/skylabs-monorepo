import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './timeout';

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves with the value when the promise settles before the timeout', async () => {
    const result = withTimeout(Promise.resolve('ok'), 1000);
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe('ok');
  });

  it('rejects with a clear error once the timeout elapses', async () => {
    const never = new Promise<string>(() => undefined);
    const result = withTimeout(never, 1000, 'shell');
    const assertion = expect(result).rejects.toThrow('shell: timed out after 1000ms');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('clears its timer once the promise resolves, so it never fires', async () => {
    const result = withTimeout(Promise.resolve('ok'), 1000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer once the promise rejects, so it never fires', async () => {
    const result = withTimeout(Promise.reject(new Error('boom')), 1000).catch((err: Error) => err);
    const err = await result;
    expect((err as Error).message).toBe('boom');
    expect(vi.getTimerCount()).toBe(0);
  });
});
