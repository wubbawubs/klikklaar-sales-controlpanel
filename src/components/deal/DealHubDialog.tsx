import { useState } from 'react';
import { Phone, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStages, useMoveDeal, useDealFees, formatFee, type Deal } from '@/hooks/usePipeline';
import { DealOverviewTab } from './DealOverviewTab';

const feeSummary = (deal: Deal, fees: { amount: number; kind: string; interval: string | null }[]) =>
  fees.length
    ? fees.map(f => formatFee(f.amount, { kind: f.kind as any, interval: f.interval as any })).join(' + ')
    : formatFee(deal.value_eur, deal.billing_type);

export function DealHubDialog({ deal, open, onClose, onOpenDeal }: {
  deal: Deal | null; open: boolean; onClose: () => void; onOpenDeal: (dealId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[min(1400px,94vw)] w-[94vw] h-[90vh] p-0 gap-0 flex flex-col overflow-hidden max-sm:w-screen max-sm:h-[100dvh] max-sm:max-w-none max-sm:rounded-none">
        {deal && <DealHub key={deal.id} deal={deal} onClose={onClose} onOpenDeal={onOpenDeal} />}
      </DialogContent>
    </Dialog>
  );
}

function DealHub({ deal, onClose, onOpenDeal }: { deal: Deal; onClose: () => void; onOpenDeal: (id: string) => void }) {
  const { data: stages = [] } = useStages();
  const { data: fees = [] } = useDealFees(deal.id);
  const moveDeal = useMoveDeal();
  const [planType, setPlanType] = useState<'call' | 'meeting' | null>(null);

  const changeStage = (stageId: string) => {
    const from = stages.find(s => s.id === deal.stage_id);
    const to = stages.find(s => s.id === stageId);
    if (!to || stageId === deal.stage_id) return;
    moveDeal.mutate({ dealId: deal.id, stageId, fromStageName: from?.name ?? '—', toStageName: to.name });
  };

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3 pr-12">
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-lg font-semibold truncate">{deal.title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{feeSummary(deal, fees)}</p>
        </div>
        <Select value={deal.stage_id ?? ''} onValueChange={changeStage}>
          <SelectTrigger className="w-44 h-8"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPlanType('call')}><Phone className="h-4 w-4" /> Call plannen</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPlanType('meeting')}><Users className="h-4 w-4" /> Meeting plannen</Button>
      </div>

      {/* Body: company | tabs | agenda — stacks below lg */}
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[280px_1fr_300px]">
        <aside className="border-b lg:border-b-0 lg:border-r p-4 lg:overflow-y-auto">
          <div className="text-xs text-muted-foreground">Bedrijf (Task 5)</div>
        </aside>
        <main className="p-4 lg:overflow-y-auto min-w-0">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overzicht</TabsTrigger>
              <TabsTrigger value="prep">Voorbereiding & intake</TabsTrigger>
              <TabsTrigger value="activity">Activiteit</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <DealOverviewTab deal={deal} onSaved={() => toast.success('Opgeslagen')} onDeleted={onClose} />
            </TabsContent>
            <TabsContent value="prep" className="mt-4"><div className="text-xs text-muted-foreground">Task 6</div></TabsContent>
            <TabsContent value="activity" className="mt-4"><div className="text-xs text-muted-foreground">Task 7</div></TabsContent>
          </Tabs>
        </main>
        <aside className="border-t lg:border-t-0 lg:border-l p-4 lg:overflow-y-auto">
          <div className="text-xs text-muted-foreground">Agenda (Task 7)</div>
        </aside>
      </div>
      {void planType}
      {void onOpenDeal}
    </>
  );
}
