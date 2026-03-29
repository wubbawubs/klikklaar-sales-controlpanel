import { Activity, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { HealthStatus } from '@/hooks/useHealthCheck';

interface SEHealthBarProps {
  health: HealthStatus;
}

export default function SEHealthBar({ health }: SEHealthBarProps) {
  if (health.overall === 'checking') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Systemen worden gecontroleerd…</span>
      </div>
    );
  }

  if (health.overall === 'ok') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-4 py-2.5 text-sm text-success">
        <CheckCircle className="h-4 w-4" />
        <span className="font-medium">Alle systemen operationeel</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {health.lastChecked && `Laatst gecontroleerd: ${health.lastChecked.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm">
      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
      <div className="flex-1">
        <span className="font-medium text-destructive">Systeemwaarschuwing</span>
        <ul className="mt-1 space-y-0.5 text-muted-foreground text-xs">
          {health.errors.map((err, i) => (
            <li key={i}>• {err}</li>
          ))}
        </ul>
      </div>
      <span className="text-xs text-muted-foreground shrink-0">
        {health.lastChecked && health.lastChecked.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  );
}
