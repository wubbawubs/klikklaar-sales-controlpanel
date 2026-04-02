import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Mail, CheckCircle, XCircle, Ban, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, subDays, subHours, startOfDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';

type TimePreset = '24h' | '7d' | '30d' | 'custom';

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20',
  pending: 'bg-amber-500/15 text-amber-600 border-amber-500/20',
  dlq: 'bg-red-500/15 text-red-600 border-red-500/20',
  failed: 'bg-red-500/15 text-red-600 border-red-500/20',
  suppressed: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/20',
  bounced: 'bg-orange-500/15 text-orange-600 border-orange-500/20',
  complained: 'bg-rose-500/15 text-rose-600 border-rose-500/20',
};

const STATUS_LABELS: Record<string, string> = {
  sent: 'Verzonden',
  pending: 'In wachtrij',
  dlq: 'Mislukt',
  failed: 'Mislukt',
  suppressed: 'Onderdrukt',
  bounced: 'Bounced',
  complained: 'Klacht',
};

const PAGE_SIZE = 50;

export default function EmailMonitoringPage() {
  const [timePreset, setTimePreset] = useState<TimePreset>('7d');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);

  const dateRange = useMemo(() => {
    const now = new Date();
    switch (timePreset) {
      case '24h': return { from: subHours(now, 24), to: now };
      case '7d': return { from: subDays(now, 7), to: now };
      case '30d': return { from: subDays(now, 30), to: now };
      case 'custom': return customRange?.from && customRange?.to
        ? { from: startOfDay(customRange.from), to: new Date(startOfDay(customRange.to).getTime() + 86400000 - 1) }
        : { from: subDays(now, 7), to: now };
    }
  }, [timePreset, customRange]);

  const { data: rawLogs = [], isLoading } = useQuery({
    queryKey: ['email-logs', dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_send_log')
        .select('*')
        .gte('created_at', dateRange.from!.toISOString())
        .lte('created_at', dateRange.to!.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const deduplicatedLogs = useMemo(() => {
    const map = new Map<string, typeof rawLogs[0]>();
    for (const log of rawLogs) {
      const key = log.message_id || log.id;
      if (!map.has(key)) {
        map.set(key, log);
      }
    }
    return Array.from(map.values());
  }, [rawLogs]);

  const templateNames = useMemo(() => {
    const names = new Set(deduplicatedLogs.map(l => l.template_name));
    return Array.from(names).sort();
  }, [deduplicatedLogs]);

  const filteredLogs = useMemo(() => {
    return deduplicatedLogs.filter(log => {
      if (templateFilter !== 'all' && log.template_name !== templateFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'failed' && !['dlq', 'failed'].includes(log.status)) return false;
        if (statusFilter !== 'failed' && log.status !== statusFilter) return false;
      }
      return true;
    });
  }, [deduplicatedLogs, templateFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = filteredLogs.length;
    const sent = filteredLogs.filter(l => l.status === 'sent').length;
    const failed = filteredLogs.filter(l => ['dlq', 'failed'].includes(l.status)).length;
    const suppressed = filteredLogs.filter(l => l.status === 'suppressed').length;
    return { total, sent, failed, suppressed };
  }, [filteredLogs]);

  const pagedLogs = filteredLogs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">E-mail Monitoring</h1>
        <p className="text-sm text-muted-foreground mt-1">Overzicht van alle verzonden e-mails en hun status</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {([['24h', '24 uur'], ['7d', '7 dagen'], ['30d', '30 dagen'], ['custom', 'Aangepast']] as const).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={timePreset === key ? 'default' : 'ghost'}
              onClick={() => { setTimePreset(key); setPage(0); }}
              className="text-xs h-8"
            >
              {label}
            </Button>
          ))}
        </div>

        {timePreset === 'custom' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-8">
                {customRange?.from && customRange?.to
                  ? `${format(customRange.from, 'd MMM', { locale: nl })} – ${format(customRange.to, 'd MMM', { locale: nl })}`
                  : 'Kies datumbereik'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="range" selected={customRange} onSelect={setCustomRange} numberOfMonths={2} />
            </PopoverContent>
          </Popover>
        )}

        <Select value={templateFilter} onValueChange={(v) => { setTemplateFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder="Alle templates" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle templates</SelectItem>
            {templateNames.map(name => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle statussen</SelectItem>
            <SelectItem value="sent">Verzonden</SelectItem>
            <SelectItem value="failed">Mislukt</SelectItem>
            <SelectItem value="suppressed">Onderdrukt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Mail className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Totaal</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><CheckCircle className="h-4 w-4 text-emerald-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.sent}</p>
                <p className="text-xs text-muted-foreground">Verzonden</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10"><XCircle className="h-4 w-4 text-red-500" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.failed}</p>
                <p className="text-xs text-muted-foreground">Mislukt</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10"><Ban className="h-4 w-4 text-yellow-600" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.suppressed}</p>
                <p className="text-xs text-muted-foreground">Onderdrukt</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">E-mail log</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : pagedLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Geen e-mails gevonden voor de geselecteerde filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Template</TableHead>
                      <TableHead className="text-xs">Ontvanger</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Tijdstip</TableHead>
                      <TableHead className="text-xs">Fout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedLogs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs font-medium">{log.template_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{log.recipient_email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[log.status] || ''}`}>
                            {STATUS_LABELS[log.status] || log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), 'd MMM HH:mm', { locale: nl })}
                        </TableCell>
                        <TableCell className="text-xs text-red-500 max-w-[200px] truncate">
                          {log.error_message || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    {filteredLogs.length} resultaten · Pagina {page + 1} van {totalPages}
                  </p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 w-7 p-0">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 w-7 p-0">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
