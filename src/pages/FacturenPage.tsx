import { useMemo, useState } from 'react';
import { Plus, Check, RotateCcw, Trash2, Euro } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';
import { useCompanies } from '@/hooks/usePipeline';
import {
  useInvoices, useCreateInvoice, useUpdateInvoice, useDeleteInvoice,
  displayStatus, type InvoiceStatus,
} from '@/hooks/useInvoices';
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
const STATUS_LABEL: Record<InvoiceStatus, string> = { open: 'Open', paid: 'Betaald', overdue: 'Achterstallig' };
const STATUS_VARIANT: Record<InvoiceStatus, 'secondary' | 'default' | 'destructive'> = {
  open: 'secondary', paid: 'default', overdue: 'destructive',
};

function NewInvoiceDialog() {
  const { current } = useOrganization();
  const { data: companies } = useCompanies();
  const create = useCreateInvoice();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState('');

  const canCreate = !!current?.id;

  const submit = async () => {
    await create.mutateAsync({
      number, amount: Number(amount) || 0, description,
      company_id: companyId || null, due_at: due || null,
    });
    setOpen(false);
    setNumber(''); setAmount(''); setCompanyId(''); setDescription(''); setDue('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!canCreate}><Plus className="h-4 w-4 mr-1.5" />Nieuwe factuur</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nieuwe factuur{current ? ` · ${current.name}` : ''}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Factuurnummer</Label>
              <Input value={number} onChange={e => setNumber(e.target.value)} placeholder="2026-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Bedrag (€)</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="2500" />
            </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vervaldatum</Label>
              <Input type="date" value={due} onChange={e => setDue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Setup + maand 1" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={create.isPending || !amount}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FacturenPage() {
  const { isAllView, allOrgIds, current, available } = useOrganization();
  const orgIds = isAllView ? allOrgIds : current ? [current.id] : [];
  const { data: invoices, isLoading } = useInvoices(orgIds);
  const update = useUpdateInvoice();
  const del = useDeleteInvoice();

  const rows = useMemo(
    () => (invoices ?? []).map(inv => ({ ...inv, view: displayStatus(inv) })),
    [invoices],
  );
  const sum = (f: (s: InvoiceStatus) => boolean) => rows.filter(r => f(r.view)).reduce((s, r) => s + Number(r.amount), 0);
  const kpis = [
    { label: 'Openstaand', value: fmt(sum(s => s !== 'paid')) },
    { label: 'Achterstallig', value: fmt(sum(s => s === 'overdue')) },
    { label: 'Betaald', value: fmt(sum(s => s === 'paid')) },
  ];

  const orgName = (id: string) => available.find(o => o.id === id)?.name ?? '';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Facturen</h1>
          <p className="text-sm text-muted-foreground">
            Facturatie{isAllView ? ' · alle labels' : current ? ` · ${current.name}` : ''}
          </p>
        </div>
        <NewInvoiceDialog />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{k.label}</p>
                <Euro className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Alle facturen</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Laden…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nog geen facturen. Maak je eerste factuur aan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                    <th className="text-left font-medium py-2">Nummer</th>
                    <th className="text-left font-medium">Klant</th>
                    {isAllView && <th className="text-left font-medium">Label</th>}
                    <th className="text-right font-medium">Bedrag</th>
                    <th className="text-left font-medium pl-4">Vervalt</th>
                    <th className="text-left font-medium">Status</th>
                    <th className="text-right font-medium">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{r.number || '—'}</td>
                      <td className="text-muted-foreground">{r.company?.name || '—'}</td>
                      {isAllView && <td className="text-muted-foreground">{orgName(r.org_id)}</td>}
                      <td className="text-right tabular-nums">{fmt(Number(r.amount))}</td>
                      <td className="pl-4 text-muted-foreground tabular-nums">{r.due_at || '—'}</td>
                      <td><Badge variant={STATUS_VARIANT[r.view]}>{STATUS_LABEL[r.view]}</Badge></td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {r.status === 'paid' ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Heropenen"
                              onClick={() => update.mutate({ id: r.id, status: 'open' })}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600" title="Markeer betaald"
                              onClick={() => update.mutate({ id: r.id, status: 'paid' })}>
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Verwijderen"
                            onClick={() => del.mutate(r.id)}>
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
        Facturen staan in je eigen Supabase, onder hetzelfde control panel als de pipeline en finance. Een openstaande factuur waarvan de vervaldatum voorbij is, toont automatisch als achterstallig.
      </p>
    </div>
  );
}
