import { useState } from 'react';
import { Mail, MoreHorizontal, Phone, Plus, Star, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDealContacts, type DealContactRow } from '@/hooks/useFunnels';
import { useDealContactMutations, useOrgContactOptions, type ContactOption } from '@/hooks/useDealContacts';
import type { Deal } from '@/hooks/usePipeline';

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('') || '?';

function sortDealContacts(rows: DealContactRow[]): DealContactRow[] {
  return [...rows].sort((a, b) =>
    Number(b.is_primary) - Number(a.is_primary) || (a.contact?.name ?? '').localeCompare(b.contact?.name ?? '', 'nl'));
}

export function DealContacts({ deal }: { deal: Deal }) {
  const { data: rows = [], isLoading } = useDealContacts(deal.id);
  const m = useDealContactMutations(deal.id);
  const [adding, setAdding] = useState(false);
  const { data: options = [] } = useOrgContactOptions(adding);

  const linked = new Set(rows.map(r => r.contact_id));
  const free = options.filter(o => !linked.has(o.id));
  const atCompany = deal.company_id ? free.filter(o => o.company_id === deal.company_id) : [];
  const others = free.filter(o => !atCompany.includes(o));
  const sorted = sortDealContacts(rows);

  const pick = (c: ContactOption) => {
    m.add.mutate({ contactId: c.id, role: c.title, isPrimary: rows.length === 0 });
    setAdding(false);
  };
  const item = (c: ContactOption) => (
    <CommandItem key={c.id} value={`${c.name} ${c.email ?? ''} ${c.id}`} onSelect={() => pick(c)} className="gap-2">
      <span className="min-w-0 flex-1 truncate">{c.name}</span>
      {c.email && <span className="max-w-[45%] truncate text-xs text-muted-foreground">{c.email}</span>}
    </CommandItem>
  );

  return (
    <section aria-labelledby="deal-contacts-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="deal-contacts-heading" className="text-[15px] font-semibold tracking-tight">Contactpersonen</h3>
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-full text-primary hover:text-primary">
              <Plus className="h-4 w-4" /> Toevoegen
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(320px,calc(100vw-32px))] p-0">
            <Command>
              <CommandInput placeholder="Zoek een contactpersoon…" />
              <CommandList>
                <CommandEmpty>Geen contactpersonen gevonden.</CommandEmpty>
                {atCompany.length > 0 && <CommandGroup heading="Bij dit bedrijf">{atCompany.map(item)}</CommandGroup>}
                {others.length > 0 && <CommandGroup heading={atCompany.length ? 'Overige contactpersonen' : undefined}>{others.map(item)}</CommandGroup>}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-xl bg-black/[0.04] motion-reduce:animate-none" />
      ) : sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/10 px-4 py-5 text-center text-sm text-muted-foreground dark:border-border">
          Nog geen contactpersonen gekoppeld.
        </p>
      ) : (
        <ul className="divide-y divide-black/[0.06] overflow-hidden rounded-xl border border-white/70 bg-white/60 dark:divide-border dark:border-border dark:bg-card/60">
          {sorted.map(r => (
            <li key={r.contact_id} className="flex items-center gap-3 px-3.5 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-primary"
                style={{ backgroundColor: 'hsl(var(--org-accent) / 0.12)' }} aria-hidden>
                {initials(r.contact?.name ?? '')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{r.contact?.name ?? 'Onbekend contact'}</span>
                  {r.is_primary && (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Primair</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
                  {r.role && <span className="truncate">{r.role}</span>}
                  {r.contact?.email && (
                    <a href={`mailto:${r.contact.email}`} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{r.contact.email}</span>
                    </a>
                  )}
                  {r.contact?.phone && (
                    <a href={`tel:${r.contact.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                      <Phone className="h-3.5 w-3.5" />{r.contact.phone}
                    </a>
                  )}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" aria-label={`Acties voor ${r.contact?.name ?? 'contact'}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!r.is_primary && (
                    <DropdownMenuItem onSelect={() => m.setPrimary.mutate(r.contact_id)} className="gap-2">
                      <Star className="h-4 w-4" /> Primair maken
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => m.remove.mutate(r.contact_id)} className="gap-2 text-destructive focus:text-destructive">
                    <UserMinus className="h-4 w-4" /> Ontkoppelen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
