import { useState } from 'react';
import { Building2, Globe, MapPin, Phone, Mail, Tag, Pencil, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompanies, useUpdateDeal, type Deal } from '@/hooks/usePipeline';
import { useTasks } from '@/hooks/useTasks';
import { sortTasks } from '@/lib/tasks';
import { TaskRow, TaskQuickAdd } from '@/components/tasks';
import { useCompany, useUpdateCompany, useCreateCompanyForDeal, useContact, useUpdateContact, useCompanyDeals, type Company, type Contact } from '@/hooks/useCompanyHub';

const Section = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section className="mb-5">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {action}
    </div>
    {children}
  </section>
);

const Row = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
  <p className="flex items-center gap-2 text-sm py-0.5 min-w-0"><Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="truncate">{children}</span></p>
);

function LinkCompany({ deal, onDone }: { deal: Deal; onDone?: () => void }) {
  const { data: companies = [] } = useCompanies();
  const update = useUpdateDeal();
  const create = useCreateCompanyForDeal();
  const [name, setName] = useState('');
  return (
    <div className="rounded-lg border border-dashed p-3 space-y-2">
      <p className="text-sm font-medium">Koppel een bedrijf</p>
      <Select onValueChange={v => update.mutate({ id: deal.id, company_id: v }, { onSuccess: onDone })}>
        <SelectTrigger className="h-8"><SelectValue placeholder="Kies bestaand bedrijf" /></SelectTrigger>
        <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
      </Select>
      <div className="flex gap-2">
        <Input className="h-8" placeholder="Of nieuw bedrijf…" value={name} onChange={e => setName(e.target.value)} />
        <Button size="sm" disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ dealId: deal.id, name: name.trim() }, { onSuccess: onDone })}>+</Button>
      </div>
    </div>
  );
}

const COMPANY_FIELDS: { key: keyof Company; label: string }[] = [
  { key: 'name', label: 'Naam' }, { key: 'website', label: 'Website' }, { key: 'industry', label: 'Branche' },
  { key: 'city', label: 'Plaats' }, { key: 'phone', label: 'Telefoon' }, { key: 'email', label: 'E-mail' },
];

function CompanyCard({ company }: { company: Company }) {
  const update = useUpdateCompany();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Company>>(company);
  if (editing) {
    return (
      <div className="space-y-2">
        {COMPANY_FIELDS.map(f => (
          <Input key={f.key} className="h-8" placeholder={f.label} value={(form[f.key] as string) ?? ''}
            onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value || null }))} />
        ))}
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => { setForm(company); setEditing(false); }}>Annuleren</Button>
          <Button size="sm" disabled={!form.name?.trim()} onClick={() => {
            const { name, website, industry, city, phone, email } = form;
            update.mutate({ id: company.id, name: name!.trim(), website, industry, city, phone, email }, { onSuccess: () => setEditing(false) });
          }}>Opslaan</Button>
        </div>
      </div>
    );
  }
  const href = company.website && (company.website.startsWith('http') ? company.website : `https://${company.website}`);
  return (
    <div className="group relative">
      <button className="absolute right-0 top-0 text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)} aria-label="Bedrijf bewerken"><Pencil className="h-3.5 w-3.5" /></button>
      <Row icon={Building2}><span className="font-medium">{company.name}</span></Row>
      {href && <Row icon={Globe}><a href={href} target="_blank" rel="noopener" className="text-primary hover:underline">{company.website}</a></Row>}
      {company.industry && <Row icon={Tag}>{company.industry}</Row>}
      {company.city && <Row icon={MapPin}>{company.city}</Row>}
      {company.phone && <Row icon={Phone}><a href={`tel:${company.phone}`}>{company.phone}</a></Row>}
      {company.email && <Row icon={Mail}><a href={`mailto:${company.email}`}>{company.email}</a></Row>}
    </div>
  );
}

function ContactCard({ contact }: { contact: Contact }) {
  const update = useUpdateContact();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>(contact);
  if (editing) {
    return (
      <div className="space-y-2">
        {(['name', 'title', 'phone', 'email'] as const).map(k => (
          <Input key={k} className="h-8" placeholder={{ name: 'Naam', title: 'Functie', phone: 'Telefoon', email: 'E-mail' }[k]}
            value={(form[k] as string) ?? ''} onChange={e => setForm(s => ({ ...s, [k]: e.target.value || null }))} />
        ))}
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => { setForm(contact); setEditing(false); }}>Annuleren</Button>
          <Button size="sm" disabled={!form.name?.trim()} onClick={() => {
            const { name, title, phone, email } = form;
            update.mutate({ id: contact.id, name: name!.trim(), title, phone, email }, { onSuccess: () => setEditing(false) });
          }}>Opslaan</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="relative">
      <button className="absolute right-0 top-0 text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)} aria-label="Contact bewerken"><Pencil className="h-3.5 w-3.5" /></button>
      <Row icon={User}><span className="font-medium">{contact.name}</span>{contact.title && <span className="text-muted-foreground"> · {contact.title}</span>}</Row>
      {contact.phone && <Row icon={Phone}><a href={`tel:${contact.phone}`}>{contact.phone}</a></Row>}
      {contact.email && <Row icon={Mail}><a href={`mailto:${contact.email}`}>{contact.email}</a></Row>}
    </div>
  );
}

function CompanyTasks({ companyId }: { companyId: string }) {
  const { data: tasks = [] } = useTasks({ companyId });
  return (
    <Section title="Taken">
      <div className="space-y-2">
        <TaskQuickAdd defaults={{ companyId }} />
        {tasks.length === 0
          ? <p className="text-xs text-muted-foreground">Geen open taken voor dit bedrijf</p>
          : <ul className="space-y-1">{sortTasks(tasks).map(t => <li key={t.id}><TaskRow task={t} hideLinks={['company']} /></li>)}</ul>}
      </div>
    </Section>
  );
}

export function CompanyPanel({ deal, onOpenDeal }: { deal: Deal; onOpenDeal: (id: string) => void }) {
  const { data: company } = useCompany(deal.company_id);
  const { data: contact } = useContact(deal.contact_id);
  const { data: companyDeals = [] } = useCompanyDeals(deal.company_id);
  const others = companyDeals.filter(d => d.id !== deal.id);
  const updateDeal = useUpdateDeal();
  const [relinking, setRelinking] = useState(false);

  const companyActions = deal.company_id ? (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setRelinking(r => !r)}>{relinking ? 'Annuleren' : 'Wijzig'}</Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive">Ontkoppel</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bedrijf ontkoppelen?</AlertDialogTitle>
            <AlertDialogDescription>De deal blijft bestaan, maar is daarna niet meer aan dit bedrijf gekoppeld.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => { updateDeal.mutate({ id: deal.id, company_id: null }); setRelinking(false); }}>Ontkoppel</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  ) : undefined;

  return (
    <>
      <Section title="Bedrijf" action={companyActions}>
        {!deal.company_id || relinking ? <LinkCompany deal={deal} onDone={() => setRelinking(false)} /> : company ? <CompanyCard key={company.id} company={company} /> : null}
      </Section>
      <Section title="Contactpersoon">
        {contact ? <ContactCard key={contact.id} contact={contact} /> : <p className="text-xs text-muted-foreground">Geen contactpersoon</p>}
      </Section>
      {deal.company_id && <CompanyTasks companyId={deal.company_id} />}
      {others.length > 0 && (
        <Section title="Andere deals">
          <ul className="space-y-1">
            {others.map(d => (
              <li key={d.id}>
                <button className="text-sm text-left hover:underline" onClick={() => onOpenDeal(d.id)}>
                  {d.title} {d.stage && <span className="text-muted-foreground">({d.stage.name})</span>}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
