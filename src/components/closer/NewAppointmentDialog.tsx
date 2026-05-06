import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgId } from '@/hooks/useOrgId';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CLOSER_STATUSES, type CloserStatus } from '@/lib/closer-statuses';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

export function NewAppointmentDialog({ open, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const orgId = useOrgId();
  const [saving, setSaving] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [status, setStatus] = useState<CloserStatus>('call');
  const [notes, setNotes] = useState('');
  const [dealValue, setDealValue] = useState('');

  const reset = () => {
    setOrgName(''); setContactName(''); setContactEmail(''); setContactPhone('');
    setScheduledAt(''); setStatus('call'); setNotes(''); setDealValue('');
  };

  const handleSave = async () => {
    if (!user) return;
    if (!orgName.trim() && !contactName.trim()) {
      toast.error('Vul minimaal bedrijfsnaam of contactnaam in');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('closer_appointments').insert({
      closer_user_id: user.id,
      organization_id: orgId,
      org_name: orgName.trim() || null,
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      status,
      notes: notes.trim() || null,
      deal_value_eur: dealValue ? Number(dealValue) : null,
    });
    setSaving(false);
    if (error) {
      toast.error('Aanmaken mislukt: ' + error.message);
      return;
    }
    toast.success('Lead toegevoegd aan CRM');
    reset();
    onCreated?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nieuwe lead toevoegen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Bedrijfsnaam</Label>
            <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Bijv. Acme BV" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Contactpersoon</Label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Telefoon</Label>
              <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>E-mail</Label>
            <Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Afspraak (optioneel)</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
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
          </div>
          <div className="grid gap-1.5">
            <Label>Deal waarde (EUR, optioneel)</Label>
            <Input type="number" value={dealValue} onChange={e => setDealValue(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Notities</Label>
            <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuleren</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Opslaan,' : 'Toevoegen'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
