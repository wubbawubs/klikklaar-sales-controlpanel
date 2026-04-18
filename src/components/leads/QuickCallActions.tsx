import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export type QuickOutcome = 'not_reached' | 'callback' | 'interest' | 'appointment' | 'deal' | 'no_interest';

export interface QuickLead {
  id: string;
  org_name: string | null;
  person_name: string | null;
  person_phone: string | null;
  status?: string;
}

interface CallbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (date: string, time: string, note: string) => void;
  lead: QuickLead | null;
}

export function CallbackDialog({ open, onOpenChange, onConfirm, lead }: CallbackDialogProps) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('09:00');
  const [note, setNote] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Callback inplannen — {lead?.org_name ?? 'Lead'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Datum</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tijd</Label>
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notitie (optioneel)</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Bijv. terugbellen na 14u" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={() => { onConfirm(date, time, note); onOpenChange(false); }}>Plannen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string) => void;
  lead: QuickLead | null;
}

export function NoteDialog({ open, onOpenChange, onConfirm, lead }: NoteDialogProps) {
  const [note, setNote] = useState('');
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setNote(''); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notitie — {lead?.org_name ?? 'Lead'}</DialogTitle>
        </DialogHeader>
        <Textarea value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder="Notitie..." autoFocus />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={() => { if (note.trim()) { onConfirm(note); setNote(''); } }} disabled={!note.trim()}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add N business days (skipping Sat/Sun) to a date and return YYYY-MM-DD
export function addBusinessDays(from: Date, days: number): string {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

interface LogCallParams {
  seId: string;
  lead: QuickLead;
  outcome: QuickOutcome;
  callbackDate?: string | null;
  callbackTime?: string | null;
  notes?: string | null;
  attemptsBefore: number; // existing not_reached count
}

// Logs a call into `calls` and updates lead assignment status accordingly.
export async function logQuickCall({
  seId, lead, outcome, callbackDate, callbackTime, notes, attemptsBefore,
}: LogCallParams): Promise<{ ok: boolean; planned?: string }> {
  // Auto callback +2 business days for first/second not_reached
  let plannedDate: string | null = callbackDate ?? null;
  let plannedTime: string | null = callbackTime ?? null;
  if (outcome === 'not_reached' && attemptsBefore < 2 && !plannedDate) {
    plannedDate = addBusinessDays(new Date(), 2);
    plannedTime = '10:00';
  }

  const { error: callErr } = await supabase.from('calls').insert({
    sales_executive_id: seId,
    lead_assignment_id: lead.id,
    org_name: lead.org_name,
    contact_name: lead.person_name,
    contact_phone: lead.person_phone,
    outcome,
    callback_date: plannedDate,
    callback_time: plannedTime,
    notes: notes ?? null,
  });
  if (callErr) {
    toast.error('Call loggen mislukt: ' + callErr.message);
    return { ok: false };
  }

  // Map outcome → assignment status
  const newAttempts = outcome === 'not_reached' ? attemptsBefore + 1 : attemptsBefore;
  let newStatus: string | null = null;
  if (outcome === 'deal') newStatus = 'won';
  else if (outcome === 'appointment') newStatus = 'qualified';
  else if (outcome === 'interest') newStatus = 'interest';
  else if (outcome === 'no_interest') newStatus = 'lost';
  else if (outcome === 'callback') newStatus = 'callback';
  else if (outcome === 'not_reached') newStatus = newAttempts >= 3 ? 'no_answer' : 'contacted';

  if (newStatus && newStatus !== lead.status) {
    await supabase
      .from('pipedrive_lead_assignments')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
  }

  return { ok: true, planned: plannedDate || undefined };
}
