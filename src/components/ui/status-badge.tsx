import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success',
  inactive: 'bg-muted text-muted-foreground',
  onboarding: 'bg-info/10 text-info',
  offboarded: 'bg-destructive/10 text-destructive',
  draft: 'bg-muted text-muted-foreground',
  configured: 'bg-info/10 text-info',
  artifacts_generated: 'bg-accent/10 text-accent',
  ready: 'bg-success/10 text-success',
  executed: 'bg-success/10 text-success',
  failed: 'bg-destructive/10 text-destructive',
  manual_action_required: 'bg-warning/10 text-warning',
  pending: 'bg-warning/10 text-warning',
  completed: 'bg-success/10 text-success',
  running: 'bg-info/10 text-info',
  not_configured: 'bg-muted text-muted-foreground',
  ready_for_test: 'bg-info/10 text-info',
  connected: 'bg-success/10 text-success',
  error: 'bg-destructive/10 text-destructive',
  submitted: 'bg-success/10 text-success',
  reviewed: 'bg-primary/10 text-primary',
  follow_up_required: 'bg-warning/10 text-warning',
  none: 'bg-muted text-muted-foreground',
  no_follow_up: 'bg-muted text-muted-foreground',
  in_progress: 'bg-info/10 text-info',
  scheduled: 'bg-info/10 text-info',
  cancelled: 'bg-muted text-muted-foreground',
  invalid: 'bg-destructive/10 text-destructive',
  lost: 'bg-destructive/10 text-destructive',
  no_answer: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  callback: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  interest: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  won: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  qualified: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  assigned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
};

const statusLabels: Record<string, string> = {
  active: 'Actief',
  inactive: 'Inactief',
  onboarding: 'Onboarding',
  offboarded: 'Offboarded',
  draft: 'Concept',
  configured: 'Geconfigureerd',
  artifacts_generated: 'Artifacts gegenereerd',
  ready: 'Klaar voor uitvoering',
  executed: 'Uitgevoerd',
  failed: 'Mislukt',
  manual_action_required: 'Handmatige actie vereist',
  pending: 'In afwachting',
  completed: 'Voltooid',
  running: 'Actief',
  not_configured: 'Niet geconfigureerd',
  ready_for_test: 'Klaar voor test',
  connected: 'Verbonden',
  error: 'Fout',
  submitted: 'Ingediend',
  reviewed: 'Beoordeeld',
  follow_up_required: 'Opvolging nodig',
  design_only: 'Alleen ontwerp',
  export_package: 'Export pakket',
  controlled_execution: 'Gecontroleerde uitvoering',
  none: 'Geen',
  no_follow_up: 'Geen opvolging',
  in_progress: 'Bezig',
  scheduled: 'Gepland',
  cancelled: 'Geannuleerd',
  invalid: 'Ongeldig nummer',
  lost: 'Geen interesse',
  no_answer: 'Cold (3x geen gehoor)',
  callback: 'Callback gepland',
  interest: 'Interesse',
  won: 'Deal',
  qualified: 'Afspraak',
  assigned: 'Toegewezen',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium',
        statusColors[status] || 'bg-muted text-muted-foreground',
        className
      )}
    >
      {statusLabels[status] || status}
    </span>
  );
}
