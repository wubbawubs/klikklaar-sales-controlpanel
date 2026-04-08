import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { UserPlus, Search, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { SalesExecutive } from '@/types/database';

export default function SalesExecutivesPage() {
  const [ses, setSes] = useState<SalesExecutive[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SalesExecutive | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.from('sales_executives').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setSes(data || []); setLoading(false); });
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('sales_executives').delete().eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Fout bij verwijderen', description: error.message, variant: 'destructive' });
    } else {
      setSes(prev => prev.filter(s => s.id !== deleteTarget.id));
      toast({ title: 'Verwijderd', description: `${deleteTarget.full_name} is verwijderd.` });
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const filtered = ses.filter(se =>
    se.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    se.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Sales Executives</h1>
        <Link to="/sales-executives/new"><Button><UserPlus className="h-4 w-4 mr-2" />Nieuwe SE</Button></Link>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek op naam of e-mail..." className="pl-9" />
      </div>
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Laden...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">Naam</th>
                <th className="text-left p-3 font-medium text-muted-foreground">E-mail</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Telefoon</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Startdatum</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Acties</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Geen resultaten</td></tr>
              ) : filtered.map(se => (
                <tr
                  key={se.id}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/sales-executives/${se.id}`)}
                >
                  <td className="p-3 font-medium text-foreground">{se.full_name}</td>
                  <td className="p-3 text-muted-foreground">{se.email}</td>
                  <td className="p-3 text-muted-foreground">{se.phone || '—'}</td>
                  <td className="p-3"><StatusBadge status={se.status} /></td>
                  <td className="p-3 text-muted-foreground">{se.start_date ? new Date(se.start_date).toLocaleDateString('nl-NL') : '—'}</td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(se); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sales Executive verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je <strong>{deleteTarget?.full_name}</strong> wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Verwijderen...' : 'Verwijderen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
