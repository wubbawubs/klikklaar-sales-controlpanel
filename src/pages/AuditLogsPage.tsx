import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import type { AuditLog } from '@/types/database';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => { setLogs(data || []); setLoading(false); });
  }, []);

  const filtered = logs.filter(l =>
    l.action_type.toLowerCase().includes(search.toLowerCase()) ||
    l.entity_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Alle systeemactiviteiten en wijzigingen</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoeken..." className="pl-9" />
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Laden...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">Datum</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Actie</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Entity ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Geen logs gevonden</td></tr>
              ) : filtered.map(log => (
                <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 text-muted-foreground">{new Date(log.created_at).toLocaleString('nl-NL')}</td>
                  <td className="p-3 font-medium">{log.action_type}</td>
                  <td className="p-3 text-muted-foreground">{log.entity_type}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs"><td className="p-3 text-muted-foreground font-mono text-xs">{log.entity_id?.slice(0, 8) || ','}</td></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
