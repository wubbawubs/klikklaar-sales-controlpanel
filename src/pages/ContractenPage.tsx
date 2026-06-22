import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, FileSignature, Repeat, AlertTriangle } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';
import { useCompanies } from '@/hooks/usePipeline';
import {
  useContracts, useSaveContract, useDeleteContract, monthlyValue,
  type Contract, type ContractKind, type ContractStatus,
} from '@/hooks/useContracts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const fmt = (v: number) => `€${Math.round(v || 0).toLocaleString('nl')}`;
const STATUS_LABEL: Record<ContractStatus, string> = { active: 'Actief', ended: 'Beëindigd', draft: 'Concept' };
const STATUS_VARIANT: Record<ContractStatus, 'default' | 'secondary' | 'outline'> = { active: 'default', ended: 'secondary', draft: 'outline' };

function valueLabel(c: Contract): string {
  const base = fmt(Number(c.value));
  if (c.kind !== 'recurring') return base;
  return base + (c.interval === 'year' ? '/jr' : '/mnd');
}

// An active contract ending within 60 days is flagged for renewal.
function expiringSoon(c: Contract): boolean {
  if (c.status !== 'active' || !c.end_date) return false;
  const days = (new Date(c.end_date).getTime() - Date.now()) / 86400000;
  return days >= 0 && days <= 60;
}

function ContractDialog({ existing, trigger }: { existing?: Contract; trigger: React.ReactNode }) {
  const { current } = useOrganization();
  const { data: companies } = useCompanies();
  const save = useSaveContract();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [companyId, setCompanyId] = useState(existing?.company_id ?? '');
  const [value, setValue] = useState(existing ? String(existing.value) : '');
  const [kind, setKind] = useState<ContractKind>(existing?.kind ?? 'recurring');
  const [interval, setInterval] = useState<'month' | 'year'>(existing?.interval ?? 'month');
  const [start, setStart] = useState(existing?.start_date ?? '');
  const [end, setEnd] = useState(existing?.end_date ?? '');
  const [status, setStatus] = useState<ContractStatus>(existing?.status ?? 'active');

  const orgId = existing?.org_id ?? current?.id;

  const submit = async () => {
    if (!orgId || !title.trim()) return;
    await save.mutateAsync({
      id: existing?.id, org_id: orgId, company_id: companyId || null,
      title, value: Number(value) || 0, kind, interval,
      start_date: start || null, end_date: end || null, status,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{existing ? 'Contract bewerken' : `Nieuw contract${current ? ` · ${current.name}` : ''}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Titel</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Retainer, SLA, abonnement…" />
          </div>
          <div className="space-y-1.5">
            <Label>Klant</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="Kies een bedrijf (optioneel)" /></SelectTrigger>
              <SelectContent>
                {(companies ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Bedrag (€)</Label>
              <Input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="5000" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={kind} onValueChange={v => setKind(v as ContractKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recurring">Periodiek</SelectItem>
                  <SelectItem value="one_time">Eenmalig</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Interval</Label>
              <Select value={interval} onValueChange={v => setInterval(v as 'month' | 'year')} disabled={kind !== 'recurring'}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Per maand</SelectItem>
                  <SelectItem value="year">Per jaar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Startdatum</Label>
              <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Einddatum</Label>
              <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as ContractStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actief</SelectItem>
                  <SelectItem value="draft">Concept</SelectItem>
                  <SelectItem value="ended">Beëindigd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={save.isPending || !title.trim() || !orgId}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ContractenPage() {
  const { isAllView, allOrgIds, current, available } = useOrganization();
  const orgIds = isAllView ? allOrgIds : current ? [current.id] : [];
  const { data: rows, isLoading } = useContracts(orgIds);
  const del = useDeleteContract();

  const list = rows ?? [];
  const active = list.filter(c => c.status === 'active');
  const mrr = active.reduce((s, c) => s + monthlyValue(c), 0);
  const expiring = useMemo(() => list.filter(expiringSoon).length, [list]);

  const kpis = [
    { label: 'Actieve contracten', value: String(active.length), icon: FileSignature },
    { label: 'MRR uit contracten', value: fmt(mrr), icon: Repeat },
    { label: 'Verloopt < 60 dagen', value: String(expiring), icon: AlertTriangle },
  ];
  const orgName = (id: string) => available.find(o => o.id === id)?.name ?? '';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Contracten</h1>
          <p className="text-sm text-muted-foreground">
            Lopende afspraken{isAllView ? ' · alle labels' : current ? ` · ${current.name}` : ''}
          </p>
        </div>
        <ContractDialog trigger={<Button size="sm" disabled={!current}><Plus className="h-4 w-4 mr-1.5" />Nieuw contract</Button>} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{k.label}</p>
                <k.icon className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Alle contracten</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Laden…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nog geen contracten. Voeg je eerste afspraak toe.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                    <th className="text-left font-medium py-2">Contract</th>
                    <th className="text-left font-medium">Klant</th>
                    {isAllView && <th className="text-left font-medium">Label</th>}
                    <th className="text-right font-medium">Waarde</th>
                    <th className="text-left font-medium pl-4">Loopt tot</th>
                    <th className="text-left font-medium">Status</th>
                    <th className="text-right font-medium">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(c => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{c.title}</td>
                      <td className="text-muted-foreground">{c.company?.name || '—'}</td>
                      {isAllView && <td className="text-muted-foreground">{orgName(c.org_id)}</td>}
                      <td className="text-right tabular-nums">{valueLabel(c)}</td>
                      <td className="pl-4 text-muted-foreground tabular-nums">
                        {c.end_date || '—'}
                        {expiringSoon(c) && <AlertTriangle className="inline h-3.5 w-3.5 ml-1.5 text-amber-500" />}
                      </td>
                      <td><Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge></td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <ContractDialog existing={c} trigger={
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Bewerken"><Pencil className="h-3.5 w-3.5" /></Button>
                          } />
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Verwijderen"
                            onClick={() => del.mutate(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Lopende klantafspraken en retainers, in je eigen Supabase. MRR telt het maandbedrag van alle actieve periodieke contracten. Contracten die binnen 60 dagen aflopen worden gemarkeerd voor verlenging.
      </p>
    </div>
  );
}
