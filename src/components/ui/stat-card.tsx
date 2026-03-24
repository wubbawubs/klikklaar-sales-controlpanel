import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
  className?: string;
}

const variantClasses = {
  default: 'bg-card border-border',
  success: 'bg-card border-success/20',
  warning: 'bg-card border-warning/20',
  destructive: 'bg-card border-destructive/20',
  info: 'bg-card border-info/20',
};

const iconVariantClasses = {
  default: 'text-primary bg-primary/10',
  success: 'text-success bg-success/10',
  warning: 'text-warning bg-warning/10',
  destructive: 'text-destructive bg-destructive/10',
  info: 'text-info bg-info/10',
};

export function StatCard({ title, value, icon: Icon, variant = 'default', className }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border p-4 shadow-sm', variantClasses[variant], className)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-card-foreground mt-1">{value}</p>
        </div>
        <div className={cn('p-2.5 rounded-lg', iconVariantClasses[variant])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
