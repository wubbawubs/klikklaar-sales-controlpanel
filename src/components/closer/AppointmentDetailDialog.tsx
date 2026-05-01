import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CLOSER_STATUSES, type CloserStatus } from '@/lib/closer-statuses';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import type { CloserAppointment } from './AppointmentCard';
import { Phone, Mail, Calendar, Trash2, CheckCircle2 } from 'lucide-react';

interface Props {
  appointment: CloserAppointment | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentDetailDialog({ appointment, open, onClose, onUpdated }: Props) {
  const [status, setStatus] = useState<CloserStatus>('call');
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [nextActionAt, setNextActionAt] = useState('');
  const [notes, setNotes] = useState('');
  const [dealValue, setDealValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showUpConfirmed, setShowUpConfirmed] = useState(false);
  const [confirmingShowUp, setConfirmingShowUp] = useState(false);

  useEffect(() => {
    if (appointment) {
      setStatus((appointment.status as CloserStatus) || 'call');
      setOrgName(appointment.org_name || '');
      setContactName(appointment.contact_name || '');
      setContactEmail(appointment.contact_email || '');
      setContactPhone(appointment.contact_phone || '');
      setScheduledAt(toLocalInput(appointment.scheduled_at));
      setNextActionAt(toLocalInput(appointment.next_action_at));
      setNotes(appointment.notes || '');
      setDealValue(appointment.deal_value_eur != null ? String(appointment.deal_value_eur) : '');
      // Check if show_up already logged for this appointment
      supabase
        .from('funnel_events')
        .select('id')
        .eq('source_table', 'manual')
        .eq('source_id', appointment.id)
        .eq('stage', 'show_up')
        .maybeSingle()
        .then(({ data }) => setShowUpConfirmed(!!data));
    }
  }, [appointment]);

  if (!appointment) return null;

  const handleConfirmShowUp = async () => {
    if (!appointment) return;
    setConfirmingShowUp(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      toast.error('Niet ingelogd');
      setConfirmingShowUp(false);
      return;
    }
    const { error } = await supabase.from('funnel_events').insert({
      funnel_type: 'cold_call',
      stage: 'show_up',
      closer_appointment_id: appointment.id,
      lead_assignment_id: appointment.lead_assignment_id,
      closer_user_id: userId,
      source_table: 'manual',
      source_id: appointment.id,
      metadata_json: { confirmed_by: userId },
    });
    setConfirmingShowUp(false);
    if (error) {
      // Unique index will reject duplicates, treat as already confirmed
      if (error.code === '23505') {
        setShowUpConfirmed(true);
        toast.info('Show-up was al bevestigd');
      } else {
        toast.error(error.message);
      }
    } else {
      setShowUpConfirmed(true);
      toast.success('Show-up bevestigd');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const payload: any = {
      status,
      org_name: orgName || null,
      contact_name: contactName || null,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      next_action_at: nextActionAt ? new Date(nextActionAt).toISOString() : null,
      notes: notes || null,
      deal_value_eur: dealValue ? Number(dealValue) : null,
    };
    const { error } = await supabase
      .from('closer_appointments')
      .update(payload)
      .eq('id', appointment.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Afspraak bijgewerkt');
      onUpdated();
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!confirm('Weet je zeker dat je deze afspraak wil verwijderen?')) return;
    setDeleting(true);
    const { error } = await supabase
      .from('closer_appointments')
      .delete()
      .eq('id', appointment.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Afspraak verwijderd');
      onUpdated();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{appointment.org_name || appointment.contact_name || 'Afspraak'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Quick contact row */}
          <div className="flex flex-wrap gap-3 text-sm">
            {appointment.contact_phone && (
              <a href={`tel:${appointment.contact_phone}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                <Phone className="h-4 w-4" /> {appointment.contact_phone}
              </a>
            )}
            {appointment.contact_email && (
              <a href={`mailto:${appointment.contact_email}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
                <Mail className="h-4 w-4" /> {appointment.contact_email}
              </a>
            )}
            {appointment.scheduled_at && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {format(new Date(appointment.scheduled_at), "EEE d MMM, HH:mm", { locale: nl })}
              </span>
            )}
          </div>

          {appointment.caller_name && (
            <div className="text-xs text-muted-foreground">
              Ingepland door, <span className="text-foreground font-medium">{appointment.caller_name}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CloserStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLOSER_STATUSES.map(s => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Deal waarde (EUR)</Label>
              <Input type="number" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="0" />
            </div>

            <div className="space-y-1.5">
              <Label>Bedrijf</Label>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Contactpersoon</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Telefoon</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Afspraak datum/tijd</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Volgende actie (reminder)</Label>
              <Input type="datetime-local" value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notities</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              placeholder="Belnotities, vervolgafspraken, ..."
            />
          </div>

          {appointment.last_activity_at && (
            <p className="text-[11px] text-muted-foreground">
              Laatste activiteit, {format(new Date(appointment.last_activity_at), "d MMM yyyy HH:mm", { locale: nl })}
            </p>
          )}
        </div>

        <DialogFooter className="mt-4 flex-row justify-between sm:justify-between">
          <Button variant="ghost" onClick={handleDelete} disabled={deleting} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Verwijderen
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Annuleren</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Opslaan...' : 'Opslaan'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
