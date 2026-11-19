import { cn } from '@/lib/utils';
import { freshness } from '@/lib/finance/format';
import { StatusDot } from './StatusDot';

/** "● Exact bijgewerkt 14:05": groene stip als vers, oranje als te oud, grijs als nooit gesynchroniseerd. */
export function FreshnessBadge({ syncedAt, now = new Date(), className }: { syncedAt: string | null; now?: Date; className?: string }) {
  const { label, stale } = freshness(syncedAt, now);
  const valid = !!syncedAt && !Number.isNaN(new Date(syncedAt).getTime());
  const text = valid
    ? `Exact bijgewerkt ${new Date(syncedAt as string).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
    : label;
  return (
    <span title={label} className={cn('text-[13px] text-muted-foreground', className)}>
      <StatusDot tone={!valid ? 'muted' : stale ? 'warning' : 'success'}>{text}</StatusDot>
    </span>
  );
}
