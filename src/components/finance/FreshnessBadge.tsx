import { cn } from '@/lib/utils';
import { freshness } from '@/lib/finance/format';

/** "Exact bijgewerkt 14:05"; rood als de data te oud is. */
export function FreshnessBadge({ syncedAt, now = new Date() }: { syncedAt: string | null; now?: Date }) {
  const { label, stale } = freshness(syncedAt, now);
  const text = syncedAt && !Number.isNaN(new Date(syncedAt).getTime())
    ? `Exact bijgewerkt ${new Date(syncedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
    : label;
  return (
    <span
      title={label}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        stale ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'bg-muted text-muted-foreground',
      )}
    >
      {text}
    </span>
  );
}
