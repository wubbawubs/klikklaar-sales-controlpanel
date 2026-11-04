import { useMemo, useState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useUpdateDeal, useBillingTypes, type Deal } from '@/hooks/usePipeline';
import { buildDealPatch, fieldValue, visibleFields } from '@/lib/dealFields';
import type { CrmField, Funnel } from '@/lib/crmTypes';

const NONE = '__none';
type Range = { min: number | null; max: number | null };

/** "150.000" / "1,5" / "150000" → number; '' → null; garbage → NaN. */
function parseNumber(s: string): number | null {
  const t = s.trim().replace(/\s|€/g, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
  return Number(normal);
}
const numText = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : '');

const fieldClass =
  'h-10 rounded-[10px] border-black/[0.08] bg-white/70 shadow-none tabular transition-colors focus-visible:bg-white dark:border-border dark:bg-background/60';

export function DealFieldsEditor({ deal, funnel, fields, onSaved }: {
  deal: Deal; funnel: Funnel; fields: CrmField[]; onSaved?: () => void;
}) {
  const update = useUpdateDeal();
  const { data: billingTypes = [] } = useBillingTypes();
  // Raw text per field while typing; parsed at save time.
  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const shown = useMemo(
    () => visibleFields(fields).filter(f => !(f.builtin && f.key === 'amount' && funnel.amount_mode === 'none')),
    [fields, funnel.amount_mode],
  );
  const dirty = Object.keys(edits).length > 0;

  const set = (id: string, v: unknown) => {
    setEdits(e => ({ ...e, [id]: v }));
    setErrors(e => { const { [id]: _drop, ...rest } = e; return rest; });
  };
  const current = (f: CrmField) => (f.id in edits ? edits[f.id] : fieldValue(deal, f));
  const currentRange = (f: CrmField): { min: string; max: string } =>
    (edits[f.id] as { min: string; max: string } | undefined) ?? { min: numText(deal.value_min_eur), max: numText(deal.value_max_eur) };

  const save = () => {
    const parsed: Record<string, unknown> = {};
    const errs: Record<string, string> = {};
    for (const [id, raw] of Object.entries(edits)) {
      const f = fields.find(x => x.id === id);
      if (!f) continue;
      if (f.builtin && f.key === 'amount' && funnel.amount_mode === 'range') {
        const r = raw as { min: string; max: string };
        const v: Range = { min: parseNumber(r.min), max: parseNumber(r.max) };
        if (Number.isNaN(v.min) || Number.isNaN(v.max)) errs[id] = 'Vul een geldig bedrag in';
        else if (v.min !== null && v.max !== null && v.min > v.max) errs[id] = 'Minimum mag niet hoger zijn dan maximum';
        parsed[id] = v;
      } else if (f.type === 'money' || f.type === 'number') {
        const n = typeof raw === 'string' ? parseNumber(raw) : (raw as number | null);
        if (Number.isNaN(n)) errs[id] = 'Vul een geldig getal in';
        else if (f.key === 'win_chance' && n !== null && (n < 0 || n > 100)) errs[id] = 'Kans moet tussen 0 en 100 liggen';
        parsed[id] = n;
      } else {
        parsed[id] = raw;
      }
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    let patch;
    try {
      patch = buildDealPatch(deal, funnel, parsed, fields);
    } catch (e) {
      setErrors({ _form: e instanceof Error ? e.message : 'Opslaan mislukt' });
      return;
    }
    update.mutate({ id: deal.id, ...patch }, { onSuccess: () => { setEdits({}); onSaved?.(); } });
  };

  const reset = () => { setEdits({}); setErrors({}); };

  if (!shown.length) {
    return <p className="text-sm text-muted-foreground">Deze funnel heeft nog geen velden.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
        {shown.map(f => {
          const wide = f.type === 'long_text' || (f.builtin && f.key === 'amount' && funnel.amount_mode === 'range');
          const inputId = `deal-field-${f.id}`;
          return (
            <div key={f.id} className={cn('min-w-0 space-y-1.5', wide && 'sm:col-span-2')}>
              <label htmlFor={inputId} className="block text-[13px] font-medium text-[#4a5563] dark:text-muted-foreground">
                {f.label}
              </label>
              {renderControl(f, inputId)}
              {errors[f.id] && <p role="alert" className="text-[13px] text-destructive">{errors[f.id]}</p>}
            </div>
          );
        })}
      </div>

      {errors._form && <p role="alert" className="text-[13px] text-destructive">{errors._form}</p>}

      <div className={cn(
        'flex items-center justify-end gap-2 pt-1 transition-opacity motion-reduce:transition-none',
        !dirty && 'opacity-60',
      )}>
        {dirty && <span className="mr-auto text-[13px] text-muted-foreground">Niet opgeslagen wijzigingen</span>}
        {dirty && <Button variant="ghost" size="sm" className="rounded-full" onClick={reset}>Annuleren</Button>}
        <Button size="sm" className="rounded-full px-5" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? 'Opslaan…' : 'Opslaan'}
        </Button>
      </div>
    </div>
  );

  function renderControl(f: CrmField, inputId: string) {
    const value = current(f);

    if (f.builtin && f.key === 'billing_type') {
      return (
        <Select value={(value as string) || NONE} onValueChange={v => set(f.id, v === NONE ? null : v)}>
          <SelectTrigger id={inputId} aria-label={f.label} className={fieldClass}><SelectValue placeholder="Kies…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Geen</SelectItem>
            {billingTypes.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }

    if (f.builtin && f.key === 'amount' && funnel.amount_mode === 'range') {
      const r = currentRange(f);
      return (
        <div className="flex items-center gap-2">
          <EuroInput id={inputId} label={`${f.label} minimum`} placeholder="Minimum" value={r.min}
            onChange={v => set(f.id, { ...r, min: v })} invalid={!!errors[f.id]} />
          <span className="text-muted-foreground" aria-hidden>–</span>
          <EuroInput label={`${f.label} maximum`} placeholder="Maximum" value={r.max}
            onChange={v => set(f.id, { ...r, max: v })} invalid={!!errors[f.id]} />
        </div>
      );
    }

    switch (f.type) {
      case 'money':
        return <EuroInput id={inputId} label={f.label} value={typeof value === 'string' ? value : numText(value)}
          onChange={v => set(f.id, v)} invalid={!!errors[f.id]} />;
      case 'number': {
        const text = typeof value === 'string' ? value : numText(value);
        const pct = f.key === 'win_chance';
        return (
          <div className="relative">
            <Input id={inputId} inputMode="decimal" value={text} onChange={e => set(f.id, e.target.value)}
              aria-invalid={!!errors[f.id]} className={cn(fieldClass, pct && 'pr-8')} placeholder={pct ? '0–100' : undefined} />
            {pct && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>}
          </div>
        );
      }
      case 'long_text':
        return <Textarea id={inputId} rows={4} value={(value as string) ?? ''} onChange={e => set(f.id, e.target.value)}
          className={cn(fieldClass, 'h-auto min-h-[96px] resize-y')} />;
      case 'date': {
        const d = typeof value === 'string' && value ? parseISO(value) : null;
        const ok = d && isValid(d);
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button id={inputId} variant="outline" className={cn(fieldClass, 'w-full justify-start gap-2 font-normal', !ok && 'text-muted-foreground')}>
                <CalendarDays className="h-4 w-4 opacity-70" />
                {ok ? format(d!, 'd MMMM yyyy', { locale: nl }) : 'Kies een datum'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" locale={nl} selected={ok ? d! : undefined} initialFocus
                onSelect={day => set(f.id, day ? format(day, 'yyyy-MM-dd') : null)} />
              {ok && (
                <div className="border-t p-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => set(f.id, null)}>Datum wissen</Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        );
      }
      case 'choice': {
        const opts = [...f.options].sort((a, b) => a.position - b.position);
        const archivedCurrent = opts.find(o => o.id === value && o.archived);
        return (
          <Select value={(value as string) || NONE} onValueChange={v => set(f.id, v === NONE ? null : v)}>
            <SelectTrigger id={inputId} aria-label={f.label} className={fieldClass}><SelectValue placeholder="Kies…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Geen</SelectItem>
              {opts.filter(o => !o.archived).map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
              {archivedCurrent && (
                <SelectItem value={archivedCurrent.id} disabled>{archivedCurrent.label} (gearchiveerd)</SelectItem>
              )}
            </SelectContent>
          </Select>
        );
      }
      case 'yes_no':
        return (
          <div className="flex h-10 items-center gap-3">
            <Switch id={inputId} checked={value === true} onCheckedChange={v => set(f.id, v)} />
            <span className="text-sm">{value === true ? 'Ja' : value === false ? 'Nee' : 'Niet ingevuld'}</span>
          </div>
        );
      default:
        return <Input id={inputId} value={(value as string) ?? ''} onChange={e => set(f.id, e.target.value)} className={fieldClass} />;
    }
  }
}

function EuroInput({ id, label, value, onChange, placeholder, invalid }: {
  id?: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
      <Input id={id} aria-label={label} inputMode="decimal" value={value} placeholder={placeholder} aria-invalid={invalid}
        onChange={e => onChange(e.target.value)} className={cn(fieldClass, 'pl-7', invalid && 'border-destructive')} />
    </div>
  );
}
