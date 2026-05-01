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

// Per status, after how many days without activity do we flag as stale
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
      className={`w-full text-left bg-card border rounded-lg p-3 transition-all cursor-pointer ${
        isDragging ? 'border-primary shadow-lg rotate-1' : 'border-border hover:border-primary/40 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm text-foreground truncate flex-1">
          {appointment.org_name || appointment.contact_name || 'Onbekend'}
        </div>
        {isStale && (
          <span
            title={`Geen activiteit sinds ${daysSince} dagen`}
            className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-1.5 py-0.5"
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            {daysSince}d
          </span>
        )}
      </div>

      {appointment.contact_name && appointment.org_name && (
        <div className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1">
          <User className="h-3 w-3" /> {appointment.contact_name}
        </div>
      )}
      {appointment.scheduled_at && (
        <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {format(new Date(appointment.scheduled_at), "d MMM, HH:mm", { locale: nl })}
        </div>
      )}
      {appointment.next_action_at && (
        <div className="text-xs text-primary mt-1 flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Volgende actie, {format(new Date(appointment.next_action_at), "d MMM", { locale: nl })}
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        {appointment.contact_phone && (
          <a
            href={`tel:${appointment.contact_phone}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Phone className="h-3 w-3" /> Bel
          </a>
        )}
        {appointment.contact_email && (
          <a
            href={`mailto:${appointment.contact_email}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Mail className="h-3 w-3" /> Mail
          </a>
        )}
      </div>
      {appointment.deal_value_eur != null && (
        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-2">
          € {Number(appointment.deal_value_eur).toLocaleString('nl-NL')}
        </div>
      )}
      {appointment.caller_name && (
        <div className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/60">
          Ingepland door, {appointment.caller_name}
        </div>
      )}
    </div>
  );
}
