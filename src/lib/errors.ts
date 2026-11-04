/** Human message of anything thrown. Supabase errors are plain objects with .message, not always `Error`s. */
export function errorMessage(e: unknown, fallback: string): string {
  if (typeof e === 'string' && e.trim()) return e;
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === 'string' && m.trim() ? m : fallback;
}
