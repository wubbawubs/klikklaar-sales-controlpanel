import { format, differenceInDays } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Phone, Mail, Calendar, User, Clock, AlertTriangle } from 'lucide-react';

export interface CloserAppointment {
  id: string;
  status: string;
  org_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  scheduled_at: string | null;
  notes: string | null;
  deal_value_eur: number | null;
  caller_sales_executive_id: string | null;
  caller_name?: string | null;
  last_activity_at?: string | null;
  next_action_at?: string | null;
}

interface Props {
  appointment: CloserAppointment;
  onClick: () => void;
  isDragging?: boolean;
}

const STALE_THRESHOLDS: Record<string, number> = {
  call: 2,
  follow_up: 5,
  no_show: 3,
  nog_betalen: 7,
  deal: 30,
  no_deal: 999,
};

export function AppointmentCard({ appointment, onClick, isDragging }: Props) {
  const lastTs = appointment.last_activity_at;
  const daysSince = lastTs ? differenceInDays(new Date(), new Date(lastTs)) : 0;
  const threshold = STALE_THRESHOLDS[appointment.status] ?? 7;
  const isStale = lastTs && daysSince >= threshold;

  return (
    <div
      onClick={onClick}
      className={`group w-full text-left bg-card border rounded-xl p-3.5 transition-all cursor-pointer ${
        isDragging
          ? 'border-primary shadow-elevated scale-[1.02]'
          : 'border-border/70 shadow-card hover:shadow-card-hover hover:border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-sm text-foreground truncate flex-1 leading-tight">
          {appointment.org_name || appointment.contact_name || 'Onbekend'}
        </div>
        {isStale && (
          <span
            title={`Geen activiteit sinds ${daysSince} dagen`}
            className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-1.5 py-0.5"
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            {daysSince}d
          </span>
        )}
      </div>

      {appointment.contact_name && appointment.org_name && (
        <div className="text-xs text-muted-foreground mt-1 truncate flex items-center gap-1.5">
          <User className="h-3 w-3 opacity-70" /> {appointment.contact_name}
        </div>
      )}
      {appointment.scheduled_at && (
        <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1.5">
          <Calendar className="h-3 w-3 opacity-70" />
          {format(new Date(appointment.scheduled_at), "d MMM, HH:mm", { locale: nl })}
        </div>
      )}
      {appointment.next_action_at && (
        <div className="text-xs text-primary mt-1 flex items-center gap-1.5 font-medium">
          <Clock className="h-3 w-3" />
          Volgende actie, {format(new Date(appointment.next_action_at), "d MMM", { locale: nl })}
        </div>
      )}

      {(appointment.contact_phone || appointment.contact_email) && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {appointment.contact_phone && (
            <a
              href={`tel:${appointment.contact_phone}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] inline-flex items-center gap-1 text-foreground bg-muted/60 hover:bg-muted border border-border/60 rounded-md px-2 py-1 transition-colors"
            >
              <Phone className="h-3 w-3 text-primary" /> Bel
            </a>
          )}
          {appointment.contact_email && (
            <a
              href={`mailto:${appointment.contact_email}`}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] inline-flex items-center gap-1 text-foreground bg-muted/60 hover:bg-muted border border-border/60 rounded-md px-2 py-1 transition-colors"
            >
              <Mail className="h-3 w-3 text-primary" /> Mail
            </a>
          )}
        </div>
      )}

      {appointment.deal_value_eur != null && (
        <div className="mt-2.5 inline-flex items-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-0.5">
          € {Number(appointment.deal_value_eur).toLocaleString('nl-NL')}
        </div>
      )}
      {appointment.caller_name && (
        <div className="text-[10px] text-muted-foreground mt-2.5 pt-2 border-t border-border/50">
          Ingepland door, {appointment.caller_name}
        </div>
      )}
    </div>
  );
}
