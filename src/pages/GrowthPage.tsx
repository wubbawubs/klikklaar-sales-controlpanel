import { useState } from 'react';
import { Plus, Target, Trash2, TrendingUp } from 'lucide-react';
import { useGrowthGoals, useCreateGoal, useDeleteGoal, METRIC_LABELS, type GoalMetric } from '@/hooks/useGrowth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function fmt(metric: GoalMetric, n: number): string {
  return metric === 'revenue' ? `€${n.toLocaleString('nl')}` : n.toLocaleString('nl');
}

function thisQuarter() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), q * 3, 1);
  const end = new Date(now.getFullYear(), q * 3 + 3, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function NewGoalDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createGoal = useCreateGoal();
  const q = thisQuarter();
  const [name, setName] = useState('');
  const [metric, setMetric] = useState<GoalMetric>('revenue');
  const [target, setTarget] = useState('');
  const [start, setStart] = useState(q.start);
  const [end, setEnd] = useState(q.end);

  const submit = () => {
    if (!name.trim() || !target) return;
    createGoal.mutate(
      { name: name.trim(), metric, target_value: Number(target), period_start: start, period_end: end },
      { onSuccess: () => { setName(''); setTarget(''); onClose(); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nieuw groeidoel</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <Input placeholder="Naam (bv. Q3 omzet)" value={name} onChange={e => setName(e.target.value)} autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Statistiek</Label>
              <Select value={metric} onValueChange={v => setMetric(v as GoalMetric)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(METRIC_LABELS) as GoalMetric[]).map(m => (
                    <SelectItem key={m} value={m}>{METRIC_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Doelwaarde</Label>
              <Input type="number" placeholder="0" value={target} onChange={e => setTarget(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label className="text-xs">Van</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label className="text-xs">Tot</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button onClick={submit} disabled={!name.trim() || !target || createGoal.isPending}>Aanmaken</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GrowthPage() {
  const { data: goals = [], isLoading } = useGrowthGoals();
  const deleteGoal = useDeleteGoal();
  const [open, setOpen] = useState(false);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Groeidoelen</h1>
          <p className="text-sm text-muted-foreground">Doelen per periode, live bijgehouden vanuit je pipeline</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nieuw doel</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : goals.length === 0 ? (
        <Card><CardContent className="py-12 flex flex-col items-center gap-2 text-muted-foreground">
          <Target className="h-8 w-8" />
          <p className="text-sm">Nog geen groeidoelen. Stel je eerste doel in.</p>
        </CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {goals.map(g => (
            <Card key={g.id} className="relative">
              <CardContent className="p-5">
                <button onClick={() => deleteGoal.mutate(g.id)} className="absolute top-3 right-3 text-muted-foreground/40 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                <p className="text-sm font-semibold">{g.name}</p>
                <p className="text-xs text-muted-foreground">{METRIC_LABELS[g.metric]} · {g.period_start} → {g.period_end}</p>
                <div className="mt-4">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-lg font-bold">{fmt(g.metric, g.current)}</span>
                    <span className="text-xs text-muted-foreground">van {fmt(g.metric, Number(g.target_value))}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${g.pct}%`, backgroundColor: g.pct >= 100 ? '#10B981' : 'var(--brand-primary, #0F9B7A)' }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{g.pct}% behaald</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewGoalDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
