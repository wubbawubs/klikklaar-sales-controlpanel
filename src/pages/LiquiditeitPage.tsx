import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Wallet, Landmark } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';
import { useCashPositions, useUpsertCash, useDeleteCash, type CashPosition } from '@/hooks/useCash';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';

const fmt = (v: number) => `€${Math.round(v || 0).toLocaleString('nl')}`;
const today = () => new Date().toISOString().slice(0, 10);

function CashDialog({ existing, trigger }: { existing?: CashPosition; trigger: React.ReactNode }) {
  const { current } = useOrganization();
  const upsert = useUpsertCash();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(existing?.account ?? '');
  const [asOf, setAsOf] = useState(existing?.as_of ?? today());
  const [balance, setBalance] = useState(existing ? String(existing.balance) : '');
  const [note, setNote] = useState(existing?.note ?? '');

  const orgId = existing?.org_id ?? current?.id;

  const submit = async () => {
    if (!orgId || !account.trim()) return;
    await upsert.mutateAsync({ org_id: orgId, account, as_of: asOf, balance: Number(balance) || 0, note });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{existing ? 'Saldo bewerken' : `Nieuw saldo${current ? ` · ${current.name}` : ''}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Rekening</Label>
            <Input value={account} onChange={e => setAccount(e.target.value)} placeholder="bunq zakelijk, ABN AMRO…" disabled={!!existing} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Peildatum</Label>
              <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} disabled={!!existing} />
            </div>
            <div className="space-y-1.5">
              <Label>Saldo (€)</Label>
              <Input type="number" value={balance} onChange={e => setBalance(e.target.value)} placeholder="25000" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notitie</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Optioneel" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={upsert.isPending || !account.trim() || !orgId}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LiquiditeitPage() {
  const { isAllView, allOrgIds, current, available } = useOrganization();
  const orgIds = isAllView ? allOrgIds : current ? [current.id] : [];
  const { data: rows, isLoading } = useCashPositions(orgIds);
  const del = useDeleteCash();

  // Current cash = latest snapshot per (org, account). Rows arrive newest-first.
  const latest = useMemo(() => {
    const seen = new Set<string>();
    const out: CashPosition[] = [];
    for (const r of rows ?? []) {
      const key = `${r.org_id}::${r.account}`;
      if (seen.has(key)) continue;
      seen.add(key); out.push(r);
    }
    return out;
  }, [rows]);

  const totalCash = latest.reduce((s, r) => s + Number(r.balance), 0);
  const orgName = (id: string) => available.find(o => o.id === id)?.name ?? '';

  const kpis = [
    { label: 'Totale liquiditeit', value: fmt(totalCash), icon: Wallet },
    { label: 'Rekeningen', value: String(latest.length), icon: Landmark },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Liquiditeit</h1>
          <p className="text-sm text-muted-foreground">
            Saldo per rekening{isAllView ? ' · alle labels' : current ? ` · ${current.name}` : ''}
          </p>
        </div>
        <CashDialog trigger={<Button size="sm" disabled={!current}><Plus className="h-4 w-4 mr-1.5" />Nieuw saldo</Button>} />
      </div>

      <div className="grid grid-cols-2 gap-3">
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
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Huidig saldo per rekening</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Laden…</p>
          ) : latest.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nog geen saldi. Voeg een rekeningsaldo toe.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                    <th className="text-left font-medium py-2">Rekening</th>
                    {isAllView && <th className="text-left font-medium">Label</th>}
                    <th className="text-left font-medium">Peildatum</th>
                    <th className="text-right font-medium">Saldo</th>
                    <th className="text-right font-medium">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.map(r => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{r.account}</td>
                      {isAllView && <td className="text-muted-foreground">{orgName(r.org_id)}</td>}
                      <td className="text-muted-foreground tabular-nums">{r.as_of}</td>
                      <td className="text-right tabular-nums font-medium">{fmt(Number(r.balance))}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <CashDialog existing={r} trigger={
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Saldo bijwerken"><Pencil className="h-3.5 w-3.5" /></Button>
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
        Saldo per rekening per peildatum, in je eigen Supabase. De totale liquiditeit telt het laatste saldo van elke rekening op. Later koppelen we dit live aan je bank (bunq).
      </p>
    </div>
  );
}
