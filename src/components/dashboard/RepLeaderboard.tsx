import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchAll } from '@/lib/fetch-all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trophy, Loader2, ArrowUpDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Rep {
  id: string;
  name: string;
  calls: number;
  reached: number;
  appts: number;
  won: number;
  reachRate: number;
  conversion: number;
}

type SortKey = 'calls' | 'reached' | 'appts' | 'won' | 'reachRate' | 'conversion';

interface Props {
  from: Date;
  to: Date;
}

export default function RepLeaderboard({ from, to }: Props) {
  const [reps, setReps] = useState<Rep[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('calls');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const load = async () => {
      const [{ data: ses }, calls, leads] = await Promise.all([
        supabase.from('sales_executives').select('id, full_name, status').eq('status', 'active'),
        fetchAll<any>('calls', q =>
          q.select('sales_executive_id, outcome, created_at').gte('created_at', from.toISOString()).lte('created_at', to.toISOString())
        ),
        fetchAll<any>('lead_assignments', q =>
          q.select('sales_executive_id, status, updated_at').gte('updated_at', from.toISOString()).lte('updated_at', to.toISOString())
        ),
      ]);

      const list: Rep[] = (ses || []).map(se => {
        const seCalls = calls.filter(c => c.sales_executive_id === se.id);
        const reached = seCalls.filter(c => c.outcome && !['not_reached', 'voicemail', 'no_answer'].includes(c.outcome)).length;
        const appts = seCalls.filter(c => c.outcome === 'appointment').length;
        const won = leads.filter(l => l.sales_executive_id === se.id && l.status === 'won').length;
        return {
          id: se.id,
          name: se.full_name || 'Onbekend',
          calls: seCalls.length,
          reached,
          appts,
          won,
          reachRate: seCalls.length > 0 ? (reached / seCalls.length) * 100 : 0,
          conversion: seCalls.length > 0 ? (won / seCalls.length) * 100 : 0,
        };
      });
      setReps(list);
    };
    load();
  }, [from, to]);

  const teamAvg = reps && reps.length > 0 ? {
    calls: reps.reduce((s, r) => s + r.calls, 0) / reps.length,
    reachRate: reps.reduce((s, r) => s + r.reachRate, 0) / reps.length,
    conversion: reps.reduce((s, r) => s + r.conversion, 0) / reps.length,
  } : null;

  const sorted = reps
    ? [...reps].sort((a, b) => {
        const diff = a[sortKey] - b[sortKey];
        return sortDir === 'desc' ? -diff : diff;
      })
    : [];

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  const TrendIcon = ({ value, avg }: { value: number; avg: number }) => {
    if (value > avg * 1.1) return <TrendingUp className="h-3 w-3 text-success inline" />;
    if (value < avg * 0.9) return <TrendingDown className="h-3 w-3 text-destructive inline" />;
    return <Minus className="h-3 w-3 text-muted-foreground inline" />;
  };

  const SortBtn = ({ k, children, align = 'right' }: { k: SortKey; children: React.ReactNode; align?: 'left' | 'right' }) => (
    <button
      onClick={() => toggleSort(k)}
      className={cn(
        'inline-flex items-center gap-1 hover:text-foreground transition-colors',
        align === 'right' ? 'justify-end w-full' : ''
      )}
    >
      {children}
      <ArrowUpDown className={cn('h-3 w-3', sortKey === k ? 'text-primary' : 'opacity-40')} />
    </button>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Leaderboard, prestaties per Sales Executive
          </CardTitle>
          {teamAvg && (
            <p className="text-[11px] text-muted-foreground">
              Team avg, {teamAvg.calls.toFixed(0)} calls | {teamAvg.reachRate.toFixed(0)}% bereik | {teamAvg.conversion.toFixed(1)}% conv
            </p>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!reps ? (
          <div className="h-32 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Geen actieve Sales Executives</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales Executive</TableHead>
                  <TableHead className="text-right"><SortBtn k="calls">Calls</SortBtn></TableHead>
                  <TableHead className="text-right"><SortBtn k="reached">Bereikt</SortBtn></TableHead>
                  <TableHead className="text-right"><SortBtn k="reachRate">Bereik %</SortBtn></TableHead>
                  <TableHead className="text-right"><SortBtn k="appts">Afspraken</SortBtn></TableHead>
                  <TableHead className="text-right"><SortBtn k="won">Deals</SortBtn></TableHead>
                  <TableHead className="text-right"><SortBtn k="conversion">Conv %</SortBtn></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r, idx) => (
                  <TableRow key={r.id} className="hover:bg-muted/40">
                    <TableCell>
                      <Link to={`/sales-executives/${r.id}`} className="font-medium text-foreground hover:text-primary transition-colors flex items-center gap-2">
                        {idx === 0 && sortDir === 'desc' && <Trophy className="h-3.5 w-3.5 text-warning" />}
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.calls} {teamAvg && <TrendIcon value={r.calls} avg={teamAvg.calls} />}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.reached}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.reachRate.toFixed(0)}% {teamAvg && <TrendIcon value={r.reachRate} avg={teamAvg.reachRate} />}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.appts}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={cn(r.won > 0 && 'font-semibold text-success')}>{r.won}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={cn(teamAvg && r.conversion > teamAvg.conversion ? 'text-success font-semibold' : '')}>
                        {r.conversion.toFixed(1)}%
                      </span>
                      {teamAvg && <span className="ml-1"><TrendIcon value={r.conversion} avg={teamAvg.conversion} /></span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
