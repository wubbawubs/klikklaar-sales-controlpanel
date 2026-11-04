import { describe, it, expect, vi, beforeEach } from 'vitest';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

import { createQueryClient } from './queryClient';
import { errorMessage } from './errors';

const run = async (opts: { meta?: Record<string, unknown>; err: unknown }) => {
  const qc = createQueryClient();
  const m = qc.getMutationCache().build(qc, {
    mutationFn: async () => { throw opts.err; },
    meta: opts.meta,
    retry: false,
  });
  await m.execute(undefined).catch(() => undefined);
};

describe('global save-error toast', () => {
  beforeEach(() => toastError.mockClear());

  it('shows "Opslaan mislukt: <message>" for a failing mutation', async () => {
    await run({ err: new Error('kapot') });
    expect(toastError).toHaveBeenCalledWith('Opslaan mislukt: kapot');
  });

  it('reads the message of a plain Supabase error object', async () => {
    await run({ err: { message: 'violates row-level security policy', code: '42501' } });
    expect(toastError).toHaveBeenCalledWith('Opslaan mislukt: violates row-level security policy');
  });

  it('stays quiet for mutations marked silent', async () => {
    await run({ err: new Error('kapot'), meta: { silent: true } });
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('errorMessage', () => {
  it('handles Error, plain objects, strings and unknowns', () => {
    expect(errorMessage(new Error('a'), 'x')).toBe('a');
    expect(errorMessage({ message: 'b' }, 'x')).toBe('b');
    expect(errorMessage('c', 'x')).toBe('c');
    expect(errorMessage(null, 'x')).toBe('x');
    expect(errorMessage({ message: '' }, 'x')).toBe('x');
  });
});
