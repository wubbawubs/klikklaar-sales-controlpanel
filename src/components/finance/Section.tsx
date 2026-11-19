import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Standaardpaneel voor finance: kop met titel, optionele beschrijving en acties rechts.
 * `flush` laat de inhoud zonder binnenmarge lopen (tabellen), met horizontale scroll.
 */
export function Section({
  title, description, actions, children, flush = false, className, bodyClassName, testId,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  testId?: string;
}) {
  const hasHeader = title !== undefined || description !== undefined || actions !== undefined;
  return (
    <section data-testid={testId} className={cn('min-w-0 rounded-xl border bg-card shadow-sm', className)}>
      {hasHeader && (
        <header className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5', flush ? 'pb-4' : 'pb-0')}>
          <div className="min-w-[12rem] flex-1 space-y-0.5">
            {title !== undefined && <h3 className="text-[15px] font-semibold leading-6 text-foreground">{title}</h3>}
            {description !== undefined && <p className="text-[13px] leading-5 text-muted-foreground">{description}</p>}
          </div>
          {actions !== undefined && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div
        className={cn(
          flush ? 'overflow-x-auto border-t' : 'p-5',
          !flush && hasHeader && 'pt-4',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
