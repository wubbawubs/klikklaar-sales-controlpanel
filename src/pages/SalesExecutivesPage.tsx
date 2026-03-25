import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { UserPlus, Search, Eye } from 'lucide-react';
import type { SalesExecutive } from '@/types/database';

export default function SalesExecutivesPage() {
  const [ses, setSes] = useState<SalesExecutive[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('sales_executives').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setSes(data || []); setLoading(false); });
  }, []);

  const filtered = ses.filter(se =>
    se.full_name.toLowerCase().includes(search.toLowerCase()) ||
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
                <tr key={se.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-medium text-foreground">{se.full_name}</td>
                  <td className="p-3 text-muted-foreground">{se.email}</td>
                  <td className="p-3 text-muted-foreground"><td className="p-3 text-muted-foreground">{se.phone || ','}</td></td>
                  <td className="p-3"><StatusBadge status={se.status} /></td>
                  <td className="p-3 text-muted-foreground">{se.start_date ? new Date(se.start_date).toLocaleDateString('nl-NL') : '—'}</td>
                  <td className="p-3 text-right">
                    <Link to={`/sales-executives/${se.id}`}>
                      <Button variant="ghost" size="sm"><Eye className="h-4 w-4 mr-1" />Bekijken</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
