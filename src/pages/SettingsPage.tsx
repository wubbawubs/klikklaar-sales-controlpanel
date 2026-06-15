import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GripVertical, Trash2, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { useStages, useCreateStage, useUpdateStage, useDeleteStage } from '@/hooks/usePipeline';
import { toast } from 'sonner';

const STAGE_COLORS = ['#6B7280', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#10B981', '#EF4444', '#06B6D4'];

function StagesTab() {
  const { data: stages = [] } = useStages();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(STAGE_COLORS[0]!);

  const add = () => {
    if (!newName.trim()) return;
    const pos = (stages[stages.length - 1]?.position ?? 0) + 1;
    createStage.mutate({ name: newName.trim(), color: newColor, position: pos }, {
      onSuccess: () => { setNewName(''); },
    });
  };

  // Swap positions with the neighbour to move a stage up/down.
  const move = (idx: number, dir: -1 | 1) => {
    const a = stages[idx];
    const b = stages[idx + dir];
    if (!a || !b) return;
    updateStage.mutate({ id: a.id, position: b.position });
    updateStage.mutate({ id: b.id, position: a.position });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Pipeline stages</CardTitle>
        <CardDescription className="text-xs">De kolommen van je pipeline. Sleep-volgorde via de pijltjes; kleur en naam zijn aanpasbaar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {stages.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-2 rounded-lg border p-2">
            <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            <input type="color" value={s.color}
              onChange={e => updateStage.mutate({ id: s.id, color: e.target.value })}
              className="h-6 w-6 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0" />
            <Input defaultValue={s.name}
              onBlur={e => { if (e.target.value.trim() && e.target.value !== s.name) updateStage.mutate({ id: s.id, name: e.target.value.trim() }); }}
              className="h-8 text-sm flex-1" />
            <div className="flex flex-col">
              <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button onClick={() => move(idx, 1)} disabled={idx === stages.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
            </div>
            <button onClick={() => deleteStage.mutate(s.id)} className="text-muted-foreground/50 hover:text-destructive shrink-0"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {stages.length === 0 && <p className="text-xs text-muted-foreground py-2">Nog geen stages. Voeg de eerste toe.</p>}

        <div className="flex items-center gap-2 pt-2 border-t mt-2">
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            className="h-6 w-6 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0" />
          <Input placeholder="Nieuwe stage (bv. Audit verstuurd)" value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()} className="h-8 text-sm flex-1" />
          <Button size="sm" className="h-8 gap-1" onClick={add} disabled={!newName.trim() || createStage.isPending}>
            <Plus className="h-3.5 w-3.5" /> Toevoegen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
import { Zap, CheckCircle2, XCircle, Clock, Webhook } from 'lucide-react';

const ALL_EVENTS = [
  { key: 'deal.created',       label: 'Deal aangemaakt' },
  { key: 'deal.stage_changed', label: 'Deal verplaatst' },
  { key: 'deal.won',           label: 'Deal gewonnen' },
  { key: 'deal.lost',          label: 'Deal verloren' },
  { key: 'contact.created',    label: 'Contact aangemaakt' },
  { key: 'card.created',       label: 'Kaart aangemaakt' },
  { key: 'card.moved',         label: 'Kaart verplaatst' },
];

interface WebhookConfig {
  id: string; url: string; events: string[]; active: boolean; created_at: string;
}
interface WebhookLog {
  id: string; event: string; response_status: number | null; delivered_at: string;
}

function WebhooksTab() {
  const qc = useQueryClient();
  const orgId = useOrgId();

  const { data: configs = [] } = useQuery({
    queryKey: ['webhook-configs', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('webhook_configs').select('*').eq('org_id', orgId!);
      if (error) throw error;
      return (data ?? []) as WebhookConfig[];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['webhook-logs', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!configs.length) return [];
      const ids = configs.map(c => c.id);
      const { data, error } = await supabase
        .from('webhook_logs').select('*').in('config_id', ids)
        .order('delivered_at', { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as WebhookLog[];
    },
  });

  const existing = configs[0];
  const [url, setUrl] = useState(existing?.url ?? '');
  const [events, setEvents] = useState<string[]>(existing?.events ?? ALL_EVENTS.map(e => e.key));

  const save = useMutation({
    mutationFn: async () => {
      if (existing) {
        const { error } = await supabase.from('webhook_configs').update({ url, events }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('webhook_configs').insert({ org_id: orgId, url, events, active: true });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhook-configs', orgId] }); toast.success('Webhook opgeslagen'); },
  });

  const toggle = useMutation({
    mutationFn: async (active: boolean) => {
      if (!existing) return;
      const { error } = await supabase.from('webhook_configs').update({ active }).eq('id', existing.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhook-configs', orgId] }),
  });

  const toggleEvent = (key: string) =>
    setEvents(prev => prev.includes(key) ? prev.filter(e => e !== key) : [...prev, key]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4" />Claude Bot Webhook</CardTitle>
          <CardDescription className="text-xs">
            Stuur events naar je One-Group Bot. De bot kan dan automatisch reageren: audit starten, leads zoeken, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Webhook URL</Label>
            <Input
              placeholder="https://one-group-bot.workers.dev/webhook"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Events</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_EVENTS.map(e => (
                <label key={e.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={events.includes(e.key)}
                    onChange={() => toggleEvent(e.key)}
                    className="rounded"
                  />
                  <span className="text-sm">{e.label}</span>
                </label>
              ))}
            </div>
          </div>

          {existing && (
            <div className="flex items-center gap-3 pt-1">
              <Switch
                checked={existing.active}
                onCheckedChange={v => toggle.mutate(v)}
              />
              <Label className="text-sm">{existing.active ? 'Actief' : 'Uitgeschakeld'}</Label>
            </div>
          )}

          <Button size="sm" onClick={() => save.mutate()} disabled={!url.trim() || save.isPending}>
            Opslaan
          </Button>
        </CardContent>
      </Card>

      {/* Delivery log */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Webhook className="h-4 w-4" />Recente leveringen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logs.map(log => {
                const ok = log.response_status && log.response_status < 300;
                const Icon = ok ? CheckCircle2 : log.response_status ? XCircle : Clock;
                const color = ok ? 'text-emerald-500' : log.response_status ? 'text-red-500' : 'text-amber-500';
                return (
                  <div key={log.id} className="flex items-center gap-3 text-sm">
                    <Icon className={`h-4 w-4 shrink-0 ${color}`} />
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{log.event}</span>
                    <span className="text-muted-foreground text-xs ml-auto">
                      {log.response_status ? `HTTP ${log.response_status}` : 'Wacht...'} ·{' '}
                      {new Date(log.delivered_at).toLocaleTimeString('nl', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Instellingen</h1>
        <p className="text-sm text-muted-foreground">Beheer webhooks en organisatie-instellingen</p>
      </div>
      <Tabs defaultValue="pipeline">
        <TabsList className="mb-4">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline"><StagesTab /></TabsContent>
        <TabsContent value="webhooks"><WebhooksTab /></TabsContent>
      </Tabs>
    </div>
  );
}
