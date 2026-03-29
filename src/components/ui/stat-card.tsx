import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
  className?: string;
  to?: string;
}

const variantClasses = {
  default: 'bg-card border-border/60',
  success: 'bg-card border-success/30',
  warning: 'bg-card border-warning/30',
  destructive: 'bg-card border-destructive/30',
  info: 'bg-card border-info/30',
};

const iconVariantClasses = {
  default: 'text-primary bg-primary/10',
  success: 'text-success bg-success/10',
  warning: 'text-warning bg-warning/10',
  destructive: 'text-destructive bg-destructive/10',
  info: 'text-info bg-info/10',
};

export function StatCard({ title, value, icon: Icon, variant = 'default', className, to }: StatCardProps) {
  const content = (
    <div className={cn(
      'rounded-xl border p-5 shadow-card transition-all duration-200',
      variantClasses[variant],
      to && 'cursor-pointer hover:shadow-card-hover hover:scale-[1.01] active:scale-[0.99]',
      className
    )}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="stat-number text-card-foreground mt-1.5">{value}</p>
        </div>
        <div className={cn('p-3 rounded-xl', iconVariantClasses[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );

  if (to) {
    return <Link to={to} className="block">{content}</Link>;
  }

  return content;
}
