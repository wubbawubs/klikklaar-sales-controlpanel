import { useState } from 'react';
import { Plus, Building2, Mail, Phone, Search } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Contact { id: string; name: string; email: string | null; phone: string | null; title: string | null; company?: { name: string } | null; created_at: string }

function useContacts() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['contacts', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts').select('*, company:companies(name)').eq('org_id', orgId!).order('name');
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });
}

function NewContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const orgId = useOrgId();
  const [form, setForm] = useState({ name: '', email: '', phone: '', title: '' });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('contacts').insert({ ...form, org_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts', orgId] }); toast.success('Contact aangemaakt'); onClose(); setForm({ name: '', email: '', phone: '', title: '' }); },
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nieuw contact</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          {(['name', 'email', 'phone', 'title'] as const).map(f => (
            <Input key={f} placeholder={{ name: 'Naam *', email: 'Email', phone: 'Telefoon', title: 'Functie' }[f]}
              value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} autoFocus={f === 'name'} />
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button onClick={() => create.mutate()} disabled={!form.name.trim() || create.isPending}>Aanmaken</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ContactsPage() {
  const { data: contacts = [] } = useContacts();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Contacten</h1>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Nieuw contact</Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Zoeken..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>{['Naam', 'Bedrijf', 'Functie', 'Email', 'Telefoon'].map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
            ))}</tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.company?.name && <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{c.company.name}</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.title}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-foreground"><Mail className="h-3.5 w-3.5" />{c.email}</a>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 hover:text-foreground"><Phone className="h-3.5 w-3.5" />{c.phone}</a>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">Geen contacten gevonden</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <NewContactDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
