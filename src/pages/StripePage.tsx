import { useQuery } from '@tanstack/react-query';
import { Repeat, TrendingUp, CreditCard, Wallet, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Charge {
  id: string; amount: number; currency: string; status: string; paid: boolean;
  created: number; description: string | null; customer_email: string | null;
}
interface StripeSummary {
  configured: boolean;
  error?: string;
  currency?: string;
  balance?: { available: number; pending: number };
  mrr?: number; arr?: number; activeSubs?: number; subsHasMore?: boolean;
  recent?: Charge[]; failed?: Charge[];
}

const money = (cents: number, cur = 'eur') =>
  new Intl.NumberFormat('nl', { style: 'currency', currency: cur.toUpperCase(), maximumFractionDigits: 0 }).format((cents || 0) / 100);
const dt = (s: number) => new Date(s * 1000).toLocaleDateString('nl', { day: 'numeric', month: 'short' });

function useStripe() {
  return useQuery({
    queryKey: ['stripe-summary'],
    queryFn: async (): Promise<StripeSummary> => {
      const { data, error } = await supabase.functions.invoke('stripe-summary');
      if (error) throw error;
      return data as StripeSummary;
    },
    staleTime: 60_000,
  });
}

export default function StripePage() {
  const { data, isLoading, isFetching, refetch } = useStripe();
  const cur = data?.currency ?? 'eur';

  if (!isLoading && data && !data.configured) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold mb-2">Stripe</h1>
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Stripe is nog niet gekoppeld. Zet <code className="text-foreground">STRIPE_SECRET_KEY</code> als secret in de control-panel Supabase.
        </CardContent></Card>
      </div>
    );
  }

  const kpis = [
    { label: 'MRR', value: money(data?.mrr ?? 0, cur), icon: Repeat },
    { label: 'ARR', value: money(data?.arr ?? 0, cur), icon: TrendingUp },
    { label: 'Actieve abonnementen', value: String(data?.activeSubs ?? 0), icon: CreditCard },
    { label: 'Saldo (beschikbaar)', value: money(data?.balance?.available ?? 0, cur), icon: Wallet },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Stripe</h1>
          <p className="text-sm text-muted-foreground">
            Live uit Stripe{data?.subsHasMore ? ' · >100 abonnementen, MRR is een ondergrens' : ''}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />Vernieuwen
        </Button>
      </div>

      {data?.error && (
        <Card className="border-rose-300"><CardContent className="p-4 text-sm text-rose-600">
          Stripe-fout: {data.error}
        </CardContent></Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{k.label}</p>
                <k.icon className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold">{isLoading ? '…' : k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!!data?.failed?.length && (
        <Card className="border-amber-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />Mislukte incasso's
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.failed.map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{dt(c.created)} · {c.customer_email || c.description || c.id}</span>
                  <span className="tabular-nums font-medium">{money(c.amount, c.currency)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Recente betalingen</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Laden…</p>
          ) : !data?.recent?.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nog geen betalingen in Stripe.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground uppercase tracking-wide border-b">
                    <th className="text-left font-medium py-2">Datum</th>
                    <th className="text-left font-medium">Klant</th>
                    <th className="text-right font-medium">Bedrag</th>
                    <th className="text-left font-medium pl-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map(c => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2.5 tabular-nums text-muted-foreground">{dt(c.created)}</td>
                      <td>{c.customer_email || c.description || '—'}</td>
                      <td className="text-right tabular-nums font-medium">{money(c.amount, c.currency)}</td>
                      <td className="pl-4">
                        <Badge variant={c.status === 'succeeded' ? 'default' : c.status === 'failed' ? 'destructive' : 'secondary'}>
                          {c.status === 'succeeded' ? 'Betaald' : c.status === 'failed' ? 'Mislukt' : c.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Live data uit je Stripe-account, via de control-panel Supabase. De secret key staat server-side als Supabase secret, niet in de frontend. Saldo is per valuta; bij meerdere valuta zie je de hoofdvaluta.
      </p>
    </div>
  );
}
