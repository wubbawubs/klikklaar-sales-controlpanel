// Quick-add and lead dialogs, shared by the funnel board and the legacy pipeline page.
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useCreateDeal, useCreateLead, useCompanies, useBillingTypes } from '@/hooks/usePipeline';
import type { Funnel } from '@/lib/crmTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type AmountMode = Funnel['amount_mode'];

export function NewDealDialog({ stageId, stageName, open, onClose, amountMode = 'fixed' }: {
  stageId: string; stageName: string; open: boolean; onClose: () => void; amountMode?: AmountMode;
}) {
  const createDeal = useCreateDeal();
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');

  const submit = () => {
    if (!title.trim()) { toast.error('Naam verplicht'); return; }
    createDeal.mutate({ title: title.trim(), stage_id: stageId, value_eur: amountMode !== 'none' && value ? Number(value) : null } as any, {
      onSuccess: () => { setTitle(''); setValue(''); onClose(); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nieuwe deal — {stageName}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <Input placeholder="Naam van de deal" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          {amountMode !== 'none' && (
            <Input placeholder="Waarde (€)" type="number" value={value} onChange={e => setValue(e.target.value)} />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button onClick={submit} disabled={createDeal.isPending}>Aanmaken</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const NEW_COMPANY = '__new__';

export function LeadDialog({ open, onClose, stages, defaultStageId, amountMode = 'fixed' }: {
  open: boolean; onClose: () => void; amountMode?: AmountMode;
  stages: { id: string; name: string }[]; defaultStageId: string;
}) {
  const createLead = useCreateLead();
  const { data: companies = [] } = useCompanies();
  const { data: billingTypes = [] } = useBillingTypes();
  const [billingTypeId, setBillingTypeId] = useState<string>('');
  const [companyId, setCompanyId] = useState<string>(NEW_COMPANY);
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [stageId, setStageId] = useState(defaultStageId);

  const reset = () => {
    setCompanyId(NEW_COMPANY); setCompanyName(''); setContactName(''); setEmail('');
    setLinkedin(''); setPhone(''); setTitle(''); setValue(''); setStageId(defaultStageId); setBillingTypeId('');
  };

  const submit = () => {
    const isNew = companyId === NEW_COMPANY;
    if (!title.trim() && !companyName.trim() && !contactName.trim()) {
      toast.error('Vul minstens bedrijf of dealnaam in'); return;
    }
    createLead.mutate({
      companyId: isNew ? null : companyId,
      companyName: isNew ? companyName : undefined,
      contactName, email, linkedin, phone,
      title: title.trim() || companyName.trim() || contactName.trim(),
      valueEur: amountMode !== 'none' && value ? Number(value) : null,
      billingTypeId: billingTypeId || null,
      stageId: stageId || defaultStageId,
    }, { onSuccess: () => { reset(); onClose(); } });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4" /> Nieuwe deal</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Bedrijf</label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_COMPANY}>+ Nieuw bedrijf…</SelectItem>
                {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {companyId === NEW_COMPANY && (
              <Input placeholder="Bedrijfsnaam" value={companyName} onChange={e => setCompanyName(e.target.value)} autoFocus />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Contactpersoon" value={contactName} onChange={e => setContactName(e.target.value)} />
            <Input placeholder="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="LinkedIn URL" value={linkedin} onChange={e => setLinkedin(e.target.value)} />
            <Input placeholder="Telefoon" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <Input placeholder="Deal / titel" value={title} onChange={e => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            {amountMode !== 'none' && (
              <Input placeholder="Waarde (€)" type="number" value={value} onChange={e => setValue(e.target.value)} />
            )}
            <Select value={billingTypeId} onValueChange={setBillingTypeId}>
              <SelectTrigger><SelectValue placeholder="Tarieftype" /></SelectTrigger>
              <SelectContent>
                {billingTypes.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}{b.kind === 'recurring' && b.interval ? ` (${b.interval === 'month' ? '/mnd' : '/jr'})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Fase</label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger><SelectValue placeholder="Kies fase" /></SelectTrigger>
              <SelectContent>
                {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button onClick={submit} disabled={createLead.isPending}>{createLead.isPending ? 'Toevoegen…' : 'Deal toevoegen'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
