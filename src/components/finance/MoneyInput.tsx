import { forwardRef, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Getalinvoer met een "€"-voorvoegsel of "%"-achtervoegsel, rechts uitgelijnd met tabelcijfers. */
export const MoneyInput = forwardRef<HTMLInputElement, Omit<ComponentProps<'input'>, 'prefix'> & {
  prefix?: string;
  suffix?: string;
  wrapperClassName?: string;
}>(({ prefix, suffix, className, wrapperClassName, type = 'number', ...props }, ref) => (
  <div
    className={cn(
      'flex h-9 items-center rounded-md border border-input bg-background text-[13px] transition-colors',
      'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/30',
      wrapperClassName,
    )}
  >
    {prefix && <span className="select-none pl-2.5 text-muted-foreground">{prefix}</span>}
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-full w-full min-w-0 bg-transparent px-2.5 text-right tabular-nums outline-none',
        '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        prefix && 'pl-1.5',
        suffix && 'pr-1.5',
        className,
      )}
      {...props}
    />
    {suffix && <span className="select-none pr-2.5 text-muted-foreground">{suffix}</span>}
  </div>
));
MoneyInput.displayName = 'MoneyInput';
