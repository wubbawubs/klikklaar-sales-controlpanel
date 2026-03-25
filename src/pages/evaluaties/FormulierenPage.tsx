import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Copy, ExternalLink, MoreHorizontal, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Concept', variant: 'secondary' },
  active: { label: 'Actief', variant: 'default' },
  inactive: { label: 'Inactief', variant: 'outline' },
  archived: { label: 'Gearchiveerd', variant: 'destructive' },
};

export default function FormulierenPage() {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadForms(); }, []);

  const loadForms = async () => {
    const { data } = await (supabase as any).from('forms').select('*').order('created_at', { ascending: false });
    setForms(data || []);
    setLoading(false);
  };

  const copyUrl = (slug: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/form/${slug}`);
    toast.success('URL gekopieerd');
  };

  const toggleStatus = async (id: string, current: string) => {
    const newStatus = current === 'active' ? 'inactive' : 'active';
    await (supabase as any).from('forms').update({ status: newStatus }).eq('id', id);
    loadForms();
    toast.success(`Formulier ${newStatus === 'active' ? 'geactiveerd' : 'gedeactiveerd'}`);
  };

  const duplicateForm = async (form: any) => {
    const { data: newForm } = await (supabase as any).from('forms').insert({
      title: `${form.title} (kopie)`, slug: `${form.slug}-kopie-${Date.now()}`,
      description: form.description, status: 'draft', settings_json: form.settings_json,
    }).select('id').single();
    if (newForm) {
      const { data: qs } = await (supabase as any).from('form_questions').select('*').eq('form_id', form.id);
      if (qs?.length) {
        await (supabase as any).from('form_questions').insert(qs.map((q: any) => ({
          form_id: newForm.id, question_text: q.question_text, question_type: q.question_type,
          options_json: q.options_json, required: q.required, order_index: q.order_index, settings_json: q.settings_json,
        })));
      }
      toast.success('Formulier gedupliceerd');
      loadForms();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Formulieren</h1>
          <p className="text-muted-foreground">Beheer je evaluatie- en vragenlijstformulieren</p>
        </div>
        <Button asChild><Link to="/evaluaties/formulieren/nieuw"><Plus className="mr-2 h-4 w-4" />Nieuw formulier</Link></Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aangemaakt</TableHead>
                <TableHead className="w-[100px]">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map(f => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.title}</TableCell>
                  <TableCell className="text-muted-foreground text-sm font-mono">{f.slug}</TableCell>
                  <TableCell><Badge variant={statusMap[f.status]?.variant || 'secondary'}>{statusMap[f.status]?.label || f.status}</Badge></TableCell>
                  <TableCell className="text-sm">{new Date(f.created_at).toLocaleDateString('nl-NL')}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/evaluaties/formulieren/${f.id}`)}><Pencil className="mr-2 h-4 w-4" />Bewerken</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyUrl(f.slug)}><Copy className="mr-2 h-4 w-4" />Kopieer URL</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => window.open(`/form/${f.slug}`, '_blank')}><ExternalLink className="mr-2 h-4 w-4" />Openen</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleStatus(f.id, f.status)}>
                          {f.status === 'active' ? <><ToggleLeft className="mr-2 h-4 w-4" />Deactiveren</> : <><ToggleRight className="mr-2 h-4 w-4" />Activeren</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicateForm(f)}><Copy className="mr-2 h-4 w-4" />Dupliceren</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {forms.length === 0 && !loading && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Geen formulieren gevonden</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
