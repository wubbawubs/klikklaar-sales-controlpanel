import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, Loader2, Target } from 'lucide-react';

interface FunnelTarget {
  id: string;
  funnel_type: string;
  from_stage: string;
  to_stage: string;
  target_pct: number;
  scope: string;
  scope_user_id: string | null;
  effective_from: string;
}

const FUNNEL_LABELS: Record<string, string> = {
  cold_call: 'Cold Call',
  follow_up_close: 'Follow-up Close',
  one_call_close: 'One-call Close',
  mail_close: 'Mail Close',
  reengage_close: 'Re-engage Close',
  lost: 'Lost',
};

const STAGE_LABELS: Record<string, string> = {
  dial: 'Dial',
  conversation: 'Gesprek',
  appointment_booked: 'Afspraak geboekt',
  show_up: 'Show-up',
  sales_call_1: 'Sales Call 1',
  follow_up: 'Follow-up',
  deal_won: 'Deal gewonnen',
  deal_lost: 'Deal verloren',
};

export default function FunnelTargetsTab() {
  const [targets, setTargets] = useState<FunnelTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Record<string, number>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('funnel_targets')
      .select('*')
      .eq('scope', 'team')
      .order('funnel_type')
      .order('from_stage');
    if (error) {
      toast.error('Kon targets niet laden');
    } else {
      setTargets(data || []);
    }
    setLoading(false);
  }

  function setEdit(id: string, value: string) {
    const num = Number(value);
    setEdits(prev => ({ ...prev, [id]: num }));
  }

  async function handleSave() {
    setSaving(true);
    const changes = Object.entries(edits).filter(([id, val]) => {
      const original = targets.find(t => t.id === id);
      return original && original.target_pct !== val && val >= 0 && val <= 100;
    });

    if (changes.length === 0) {
      toast.info('Geen wijzigingen');
      setSaving(false);
      return;
    }

    let failed = 0;
    for (const [id, target_pct] of changes) {
      const { error } = await supabase
        .from('funnel_targets')
        .update({ target_pct })
        .eq('id', id);
      if (error) failed++;
    }

    setSaving(false);
    if (failed > 0) {
      toast.error(`${failed} target(s) niet opgeslagen`);
    } else {
      toast.success(`${changes.length} target(s) bijgewerkt`);
      setEdits({});
      load();
    }
  }

  // Group by funnel_type
  const grouped = targets.reduce<Record<string, FunnelTarget[]>>((acc, t) => {
    if (!acc[t.funnel_type]) acc[t.funnel_type] = [];
    acc[t.funnel_type].push(t);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasEdits = Object.keys(edits).some(id => {
    const original = targets.find(t => t.id === id);
    return original && original.target_pct !== edits[id];
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Funnel targets
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Conversiedoelen per stage. Dashboard widgets gebruiken deze waarden om afwijkingen te markeren.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!hasEdits || saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Opslaan
        </Button>
      </div>

      {Object.entries(grouped).map(([funnelType, items]) => (
        <Card key={funnelType}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Badge variant="outline">{FUNNEL_LABELS[funnelType] || funnelType}</Badge>
            </CardTitle>
            <CardDescription>Team-brede targets voor deze funnel</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Van</TableHead>
                  <TableHead>Naar</TableHead>
                  <TableHead className="w-32">Target %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(t => {
                  const currentValue = edits[t.id] !== undefined ? edits[t.id] : t.target_pct;
                  const isChanged = edits[t.id] !== undefined && edits[t.id] !== t.target_pct;
                  return (
                    <TableRow key={t.id} className={isChanged ? 'bg-primary/5' : ''}>
                      <TableCell className="font-medium">{STAGE_LABELS[t.from_stage] || t.from_stage}</TableCell>
                      <TableCell>{STAGE_LABELS[t.to_stage] || t.to_stage}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={currentValue}
                            onChange={e => setEdit(t.id, e.target.value)}
                            className="w-20 h-8"
                          />
                          <span className="text-muted-foreground text-sm">%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {targets.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            Geen targets ingesteld.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
