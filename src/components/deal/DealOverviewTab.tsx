import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useUpdateDeal, useDeleteDeal, useDealFees, useSaveDealFees, type Deal, type DealFee } from '@/hooks/usePipeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

// Fee-type options shown in the dropdown, mapped to {kind, interval}.
const FEE_KINDS = [
  { value: 'one_time', label: 'Eenmalig', kind: 'one_time' as const, interval: null },
  { value: 'month', label: 'Per maand', kind: 'recurring' as const, interval: 'month' as const },
  { value: 'year', label: 'Per jaar', kind: 'recurring' as const, interval: 'year' as const },
];
const feeKindValue = (f: DealFee) => (f.kind === 'recurring' ? (f.interval || 'month') : 'one_time');

export function DealOverviewTab({ deal, onSaved, onDeleted }: {
  deal: Deal; onSaved?: () => void; onDeleted: () => void;
}) {
  const update = useUpdateDeal();
  const deleteDeal = useDeleteDeal();
  const saveFees = useSaveDealFees();
  const { data: existingFees = [] } = useDealFees(deal.id);
  const [title, setTitle] = useState(deal.title);
  const [fees, setFees] = useState<DealFee[]>([]);
  const [feesInit, setFeesInit] = useState(false);

  useEffect(() => {
    if (feesInit) return;
    if (existingFees.length) setFees(existingFees.map(f => ({ ...f })));
    else if (deal.value_eur) setFees([{ amount: deal.value_eur, kind: 'one_time', interval: null, label: null, position: 0 }]);
    setFeesInit(true);
  }, [existingFees, feesInit, deal.value_eur]);

  const addFee = () => setFees(f => [...f, { amount: 0, kind: 'one_time', interval: null, label: null, position: f.length }]);
  const patchFee = (i: number, patch: Partial<DealFee>) => setFees(f => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeFee = (i: number) => setFees(f => f.filter((_, j) => j !== i));
  const setKind = (i: number, v: string) => { const k = FEE_KINDS.find(x => x.value === v)!; patchFee(i, { kind: k.kind, interval: k.interval }); };

  const save = () => {
    if (!title.trim()) { toast.error('Naam verplicht'); return; }
    update.mutate({ id: deal.id, title: title.trim() });
    saveFees.mutate({ dealId: deal.id, fees }, { onSuccess: onSaved });
  };

  return (
    <>
      <div className="grid gap-3 py-1">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Titel</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        {/* Fee lines — add as many as needed, no Settings trip */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Tarieven</label>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={addFee}>
              <Plus className="h-3.5 w-3.5" /> Tarief
            </Button>
          </div>
          {fees.length === 0 && (
            <p className="text-xs text-muted-foreground">Nog geen tarieven. Voeg er een toe — bv. €10.000 eenmalig én €5.000 per maand.</p>
          )}
          {fees.map((f, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input type="number" className="w-28" placeholder="€" value={f.amount || ''} onChange={e => patchFee(i, { amount: Number(e.target.value) })} />
              <Select value={feeKindValue(f)} onValueChange={v => setKind(i, v)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{FEE_KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="flex-1" placeholder="Label (optioneel)" value={f.label || ''} onChange={e => patchFee(i, { label: e.target.value })} />
              <button onClick={() => removeFee(i)} className="text-muted-foreground hover:text-destructive shrink-0" aria-label="Verwijder tarief">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1.5">
                <Trash2 className="h-4 w-4" /> Verwijderen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Deal verwijderen?</AlertDialogTitle>
                <AlertDialogDescription>
                  "{deal.title}" wordt permanent verwijderd, inclusief tarieven en activiteiten. Gekoppelde facturen blijven bestaan.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteDeal.mutate(deal.id, { onSuccess: onDeleted })}
                >
                  Verwijderen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" onClick={save} disabled={update.isPending || saveFees.isPending}>
            {update.isPending || saveFees.isPending ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </div>
      </div>
    </>
  );
}
