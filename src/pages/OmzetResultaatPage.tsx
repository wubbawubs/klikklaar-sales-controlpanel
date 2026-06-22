import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';
import { useFinancials, useUpsertFinancial, useDeleteFinancial, type Financial } from '@/hooks/useFinancials';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';

const fmt = (v: number) => `€${Math.round(v || 0).toLocaleString('nl')}`;
const pct = (rev: number, res: number) => (rev > 0 ? `${Math.round((res / rev) * 100)}%` : '—');

function PeriodDialog({ existing, trigger }: { existing?: Financial; trigger: React.ReactNode }) {
  const { current } = useOrganization();
  const upsert = useUpsertFinancial();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(existing?.period ?? '');
  const [revenue, setRevenue] = useState(existing ? String(existing.revenue) : '');
  const [costs, setCosts] = useState(existing ? String(existing.costs) : '');
  const [note, setNote] = useState(existing?.note ?? '');

  // Editing keeps the row's own org; new rows use the selected label.
  const orgId = existing?.org_id ?? current?.id;

  const submit = async () => {
    if (!orgId || !period.trim()) return;
    await upsert.mutateAsync({ org_id: orgId, period, revenue: Number(revenue) || 0, costs: Number(costs) || 0, note });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{existing ? 'Periode bewerken' : `Nieuwe periode${current ? ` · ${current.name}` : ''}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Periode</Label>
            <Input value={period} onChange={e => setPeriod(e.target.value)} placeholder="2026, 2026-Q1 of 2026-06" disabled={!!existing} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Omzet (€)</Label>
              <Input type="number" value={revenue} onChange={e => setRevenue(e.target.value)} placeholder="50000" />
            </div>
            <div className="space-y-1.5">
              <Label>Kosten (€)</Label>
              <Input type="number" value={costs} onChange={e => setCosts(e.target.value)} placeholder="30000" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notitie</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Optioneel" />
          </div>
          <p className="text-xs text-muted-foreground">
            Resultaat = omzet − kosten, wordt automatisch berekend.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={upsert.isPending || !period.trim() || !orgId}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function OmzetResultaatPage() {
  const { isAllView, allOrgIds, current, available } = useOrganization();
  const orgIds = isAllView ? allOrgIds : current ? [current.id] : [];
  const { data: rows, isLoading } = useFinancials(orgIds);
  const del = useDeleteFinancial();

  const list = useMemo(
    () => (rows ?? []).map(r => ({ ...r, result: Number(r.revenue) - Number(r.costs) })),
    [rows],
  );
  const tot = list.reduce((s, r) => ({ revenue: s.revenue + Number(r.revenue), costs: s.costs + Number(r.costs) }), { revenue: 0, costs: 0 });
  const result = tot.revenue - tot.costs;

  const kpis = [
    { label: 'Omzet', value: fmt(tot.revenue), icon: TrendingUp, tint: 'text-emerald-500' },
    { label: 'Kosten', value: fmt(tot.costs), icon: TrendingDown, tint: 'text-rose-500' },
    { label: 'Resultaat', value: fmt(result), icon: Wallet, tint: result >= 0 ? 'text-emerald-500' : 'text-rose-500' },
  ];

  const orgName = (id: string) => available.find(o => o.id === id)?.name ?? '';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Omzet & Resultaat</h1>
          <p className="text-sm text-muted-foreground">
            Per periode{isAllView ? ' · alle labels' : current ? ` · ${current.name}` : ''}
          </p>
        </div>
        <PeriodDialog trigger={<Button size="sm" disabled={!current}><Plus className="h-4 w-4 mr-1.5" />Nieuwe periode</Button>} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{k.label}</p>
                <k.icon className={`h-4 w-4 ${k.tint}`} />
              </div>
              <p className="text-2xl font-bold">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Per periode</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Laden…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nog geen cijfers. Voeg je eerste periode toe.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                    <th className="text-left font-medium py-2">Periode</th>
                    {isAllView && <th className="text-left font-medium">Label</th>}
                    <th className="text-right font-medium">Omzet</th>
                    <th className="text-right font-medium">Kosten</th>
                    <th className="text-right font-medium">Resultaat</th>
                    <th className="text-right font-medium">Marge</th>
                    <th className="text-right font-medium">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{r.period}</td>
                      {isAllView && <td className="text-muted-foreground">{orgName(r.org_id)}</td>}
                      <td className="text-right tabular-nums">{fmt(Number(r.revenue))}</td>
                      <td className="text-right tabular-nums text-muted-foreground">{fmt(Number(r.costs))}</td>
                      <td className={`text-right tabular-nums font-medium ${r.result >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmt(r.result)}</td>
                      <td className="text-right tabular-nums text-muted-foreground">{pct(Number(r.revenue), r.result)}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <PeriodDialog existing={r} trigger={
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Bewerken"><Pencil className="h-3.5 w-3.5" /></Button>
                          } />
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
        Cijfers per label per periode, in je eigen Supabase. Zet de pipeline-omzet (gewonnen deals) hier tegenover je werkelijke cijfers. Schakel naar "Algemeen" om alle labels samen te zien.
      </p>
    </div>
  );
}
