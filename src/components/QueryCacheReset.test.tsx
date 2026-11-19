import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QueryCacheReset } from './QueryCacheReset';

let userId: string | null = 'u1';
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: userId ? { id: userId } : null }) }));

function setup() {
  const qc = new QueryClient();
  qc.setQueryData(['finance', 'me'], { has_access: true });
  const ui = () => <QueryClientProvider client={qc}><QueryCacheReset /></QueryClientProvider>;
  const r = render(ui());
  return { qc, rerender: () => r.rerender(ui()) };
}

describe('QueryCacheReset', () => {
  it('laat de cache staan zolang de gebruiker gelijk blijft', () => {
    userId = 'u1';
    const { qc, rerender } = setup();
    rerender();
    expect(qc.getQueryData(['finance', 'me'])).toBeDefined();
  });

  it('leegt de cache bij wissel van gebruiker', () => {
    userId = 'u1';
    const { qc, rerender } = setup();
    userId = 'u2';
    rerender();
    expect(qc.getQueryData(['finance', 'me'])).toBeUndefined();
  });

  it('leegt de cache bij uitloggen', () => {
    userId = 'u1';
    const { qc, rerender } = setup();
    userId = null;
    rerender();
    expect(qc.getQueryData(['finance', 'me'])).toBeUndefined();
  });

  it('leegt niet bij eerste login (null -> id)', () => {
    userId = null;
    const { qc, rerender } = setup();
    userId = 'u1';
    rerender();
    expect(qc.getQueryData(['finance', 'me'])).toBeDefined();
  });
});
