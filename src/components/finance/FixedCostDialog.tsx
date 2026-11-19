import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSaveFixedCost } from '@/hooks/useFinance';
import type { FixedCostCategory } from '@/lib/finance/types';

export const FIXED_COST_CATEGORIES: { value: FixedCostCategory; label: string }[] = [
  { value: 'personeel', label: 'Personeel' },
  { value: 'huisvesting', label: 'Huisvesting' },
  { value: 'software', label: 'Software' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'verzekeringen', label: 'Verzekeringen' },
  { value: 'advies', label: 'Advies' },
  { value: 'overig', label: 'Overig' },
];

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** `companies` = de bedrijven die de gebruiker mag kiezen; de database dwingt het manage-recht per bedrijf af. */
export function FixedCostDialog({ open, onOpenChange, companies }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: { id: string; name: string }[];
}) {
  const save = useSaveFixedCost();
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [category, setCategory] = useState<FixedCostCategory>('overig');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const next: Record<string, string> = {};
    const value = Number(amount.replace(',', '.'));
    if (!name.trim()) next.name = 'Naam is verplicht';
    if (!companyId || !companies.some((c) => c.id === companyId)) next.company = 'Kies een bedrijf';
    if (amount.trim() === '' || Number.isNaN(value) || value < 0) next.amount = 'Bedrag moet 0 of meer zijn';
    if (!FIXED_COST_CATEGORIES.some((c) => c.value === category)) next.category = 'Kies een categorie';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await save.mutateAsync({
        company_id: companyId, name: name.trim(), category, monthly_amount: value, exact_supplier_code: null, active: true,
      });
      toast.success('Maandlast toegevoegd.');
      setName(''); setCompanyId(''); setCategory('overig'); setAmount('');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Opslaan mislukt');
    }
  };

  const err = (k: string) => errors[k] && <p className="text-xs text-rose-600">{errors[k]}</p>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nieuwe maandlast</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="fc-name">Naam</Label>
            <Input id="fc-name" value={name} onChange={(e) => setName(e.target.value)} />
            {err('name')}
          </div>
          <div className="space-y-1">
            <Label htmlFor="fc-company">Bedrijf</Label>
            <select id="fc-company" className={selectClass} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Kies…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {err('company')}
          </div>
          <div className="space-y-1">
            <Label htmlFor="fc-category">Categorie</Label>
            <select id="fc-category" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value as FixedCostCategory)}>
              {FIXED_COST_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {err('category')}
          </div>
          <div className="space-y-1">
            <Label htmlFor="fc-amount">Bedrag per maand</Label>
            <Input id="fc-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {err('amount')}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={save.isPending}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
