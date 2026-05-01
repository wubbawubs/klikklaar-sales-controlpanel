import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import { Phone, Mail, Calendar } from 'lucide-react';

interface Props {
  appointment: CloserAppointment | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function AppointmentDetailSheet({ appointment, open, onClose, onUpdated }: Props) {
  const [status, setStatus] = useState<CloserStatus>('call');
  const [notes, setNotes] = useState('');
  const [dealValue, setDealValue] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appointment) {
      setStatus((appointment.status as CloserStatus) || 'call');
      setNotes(appointment.notes || '');
      setDealValue(appointment.deal_value_eur != null ? String(appointment.deal_value_eur) : '');
    }
  }, [appointment]);

  if (!appointment) return null;

  const handleSave = async () => {
    setSaving(true);
    const payload: any = {
      status,
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

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{appointment.org_name || appointment.contact_name || 'Afspraak'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div className="space-y-2 text-sm">
            {appointment.contact_name && (
              <div><span className="text-muted-foreground">Contact, </span>{appointment.contact_name}</div>
            )}
            {appointment.scheduled_at && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {format(new Date(appointment.scheduled_at), "EEEE d MMMM, HH:mm", { locale: nl })}
              </div>
            )}
            {appointment.contact_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${appointment.contact_phone}`} className="text-primary hover:underline">
                  {appointment.contact_phone}
                </a>
              </div>
            )}
            {appointment.contact_email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${appointment.contact_email}`} className="text-primary hover:underline">
                  {appointment.contact_email}
                </a>
              </div>
            )}
            {appointment.caller_name && (
              <div><span className="text-muted-foreground">Ingepland door, </span>{appointment.caller_name}</div>
            )}
          </div>

          <div className="space-y-2">
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

          <div className="space-y-2">
            <Label>Deal waarde (EUR)</Label>
            <Input
              type="number"
              value={dealValue}
              onChange={(e) => setDealValue(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label>Notities</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={6}
              placeholder="Belnotities, vervolgafspraken, ..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? 'Opslaan...' : 'Opslaan'}
            </Button>
            <Button variant="outline" onClick={onClose}>Annuleren</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
