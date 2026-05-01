import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Phone, Mail, Calendar, User } from 'lucide-react';

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
}

interface Props {
  appointment: CloserAppointment;
  onClick: () => void;
}

export function AppointmentCard({ appointment, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border border-border rounded-lg p-3 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="font-medium text-sm text-foreground truncate">
        {appointment.org_name || appointment.contact_name || 'Onbekend'}
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
    </button>
  );
}
