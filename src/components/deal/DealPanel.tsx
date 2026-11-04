import { useEffect, useState } from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Building2, MoreHorizontal, Phone, Trash2, Users, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { Sheet, SheetOverlay, SheetPortal } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useStages, useMoveDeal, useUpdateDeal, useDeleteDeal, type Deal } from '@/hooks/usePipeline';
import { useFunnel, useFunnelFields } from '@/hooks/useFunnels';
import { formatAmount } from '@/lib/dealFields';
import { DealFieldsEditor } from './DealFieldsEditor';
import { DealContacts } from './DealContacts';
import { HistoryTab } from './HistoryTab';
import { ActivityTab } from './ActivityTab';
import { AppointmentsPanel } from './AppointmentsPanel';
import { AppointmentDialog } from './AppointmentDialog';
import { CompanyPanel } from './CompanyPanel';
import { PrepIntakeTab } from './PrepIntakeTab';

// CRM columns are not in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** One deal by id. Keyed under ['deals', orgId] so every deal mutation refreshes it. */
function useDeal(dealId: string | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['deals', orgId, 'one', dealId],
    enabled: !!orgId && !!dealId,
    queryFn: async () => {
      const { data, error } = await db.from('deals')
        .select('*, company:companies(name), contact:contacts!deals_contact_id_fkey(name, email, phone), billing_type:billing_types(name, kind, interval)')
        .eq('id', dealId!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Deal | null;
    },
  });
}

const TABS = [
  ['overview', 'Overzicht'], ['activity', 'Activiteit'], ['appointments', 'Afspraken'],
  ['company', 'Bedrijf'], ['prep', 'Voorbereiding'], ['history', 'Historie'],
] as const;

export function DealPanel({ dealId, funnelId, open, onOpenChange }: {
  dealId: string | null; funnelId: string; open: boolean; onOpenChange: (open: boolean) => void;
}): JSX.Element {
  // CompanyPanel can jump to a sibling deal; that stays inside the panel until the parent picks another deal.
  const [jumpId, setJumpId] = useState<string | null>(null);
  useEffect(() => setJumpId(null), [dealId, open]);
  const activeId = jumpId ?? dealId;
  const { data: deal, isLoading } = useDeal(open ? activeId : null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPortal>
        <SheetOverlay className="bg-[#1b2430]/20 backdrop-blur-[2px] dark:bg-black/50" />
        <SheetPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'glass fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden text-[#1b2430] shadow-[0_24px_80px_-12px_rgba(27,36,48,0.28)] dark:text-foreground',
            '!rounded-none sm:inset-y-2 sm:right-2 sm:h-[calc(100dvh-16px)] sm:w-[560px] sm:!rounded-[16px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'data-[state=closed]:duration-200 data-[state=open]:duration-300 motion-reduce:animate-none',
          )}
          style={{ fontFamily: '-apple-system, "SF Pro Text", "SF Pro Display", Inter, system-ui, sans-serif' }}
        >
          {deal ? (
            <PanelBody key={deal.id} deal={deal} funnelId={deal.funnel_id ?? funnelId}
              onClose={() => onOpenChange(false)} onOpenDeal={setJumpId} />
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="flex items-center justify-between p-5">
                <SheetPrimitive.Title className="text-lg font-semibold">{isLoading ? 'Deal laden…' : 'Deal niet gevonden'}</SheetPrimitive.Title>
                <CloseButton />
              </div>
              {isLoading
                ? <div className="mx-5 h-40 animate-pulse rounded-xl bg-black/[0.04] motion-reduce:animate-none" />
                : <p className="px-5 text-sm text-muted-foreground">Deze deal bestaat niet meer of staat in de prullenbak.</p>}
            </div>
          )}
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}

function CloseButton() {
  return (
    <SheetPrimitive.Close asChild>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/10" aria-label="Sluiten">
        <X className="h-4 w-4" />
      </Button>
    </SheetPrimitive.Close>
  );
}

function PanelBody({ deal, funnelId, onClose, onOpenDeal }: {
  deal: Deal; funnelId: string; onClose: () => void; onOpenDeal: (id: string) => void;
}) {
  const { data: funnel } = useFunnel(funnelId);
  const { data: fields = [] } = useFunnelFields(funnelId);
  const { data: stages = [] } = useStages(funnelId);
  const moveDeal = useMoveDeal();
  const update = useUpdateDeal();
  const deleteDeal = useDeleteDeal();
  const [title, setTitle] = useState(deal.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [planType, setPlanType] = useState<'call' | 'meeting' | null>(null);
  useEffect(() => setTitle(deal.title), [deal.title]);

  const amount = funnel ? formatAmount(deal, funnel) : null;

  const saveTitle = () => {
    const t = title.trim();
    if (!t) { setTitle(deal.title); return; }
    if (t !== deal.title) update.mutate({ id: deal.id, title: t });
  };
  const changeStage = (stageId: string) => {
    const to = stages.find(s => s.id === stageId);
    if (!to || stageId === deal.stage_id) return;
    moveDeal.mutate({ dealId: deal.id, fromStage: stages.find(s => s.id === deal.stage_id), toStage: to });
  };

  return (
    <>
      {/* Header */}
      <header className="shrink-0 space-y-3 border-b border-black/[0.06] px-4 pb-4 pt-4 dark:border-border sm:px-5">
        <div className="flex items-start gap-2">
          <SheetPrimitive.Title asChild>
            <h2 className="min-w-0 flex-1">
              <input
                aria-label="Titel"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="w-full truncate rounded-lg border border-transparent bg-transparent px-2 py-1 -ml-2 text-xl font-semibold tracking-tight outline-none transition-colors hover:border-black/[0.08] focus:border-primary/50 focus:bg-white/70 dark:focus:bg-background/60 motion-reduce:transition-none"
              />
            </h2>
          </SheetPrimitive.Title>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/10" aria-label="Meer acties">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setPlanType('call')} className="gap-2"><Phone className="h-4 w-4" /> Call plannen</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPlanType('meeting')} className="gap-2"><Users className="h-4 w-4" /> Meeting plannen</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4" /> Verwijderen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <CloseButton />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={deal.stage_id ?? ''} onValueChange={changeStage}>
            <SelectTrigger aria-label="Fase" className="h-8 w-auto max-w-full gap-2 rounded-full border-black/[0.08] bg-white/70 px-3 text-[13px] font-medium shadow-none dark:border-border dark:bg-background/60">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: stages.find(s => s.id === deal.stage_id)?.color || 'hsl(var(--org-accent))' }} aria-hidden />
              <span className="min-w-0 truncate"><SelectValue placeholder="Kies een fase" /></span>
            </SelectTrigger>
            <SelectContent>
              {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {amount && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-[13px] font-semibold text-[#1b2430] tabular dark:text-foreground">
              {amount}
            </span>
          )}
          {deal.company?.name && (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[13px] text-[#4a5563] dark:text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{deal.company.name}</span>
            </span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-4 pt-3 sm:px-5">
          <TabsList className="flex h-9 w-full justify-start gap-0.5 overflow-x-auto rounded-full bg-black/[0.05] p-1 [scrollbar-width:none] dark:bg-white/10">
            {TABS.map(([v, label]) => (
              <TabsTrigger key={v} value={v}
                className="h-7 shrink-0 rounded-full px-3 text-[13px] font-medium text-[#4a5563] data-[state=active]:bg-white data-[state=active]:text-[#1b2430] data-[state=active]:shadow-[0_1px_3px_rgba(27,36,48,0.12)] dark:text-muted-foreground dark:data-[state=active]:bg-background dark:data-[state=active]:text-foreground">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4 sm:px-5">
          <TabsContent value="overview" className="mt-0 space-y-4">
            <Card>
              {funnel
                ? <DealFieldsEditor deal={deal} funnel={funnel} fields={fields} />
                : <div className="h-24 animate-pulse rounded-lg bg-black/[0.04] motion-reduce:animate-none" />}
            </Card>
            <Card><DealContacts deal={deal} /></Card>
          </TabsContent>
          <TabsContent value="activity" className="mt-0"><Card><ActivityTab deal={deal} /></Card></TabsContent>
          <TabsContent value="appointments" className="mt-0 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 rounded-full bg-white/70" onClick={() => setPlanType('call')}><Phone className="h-4 w-4" /> Call plannen</Button>
              <Button size="sm" variant="outline" className="gap-1.5 rounded-full bg-white/70" onClick={() => setPlanType('meeting')}><Users className="h-4 w-4" /> Meeting plannen</Button>
            </div>
            <Card><AppointmentsPanel deal={deal} /></Card>
          </TabsContent>
          <TabsContent value="company" className="mt-0"><Card><CompanyPanel deal={deal} onOpenDeal={onOpenDeal} /></Card></TabsContent>
          <TabsContent value="prep" className="mt-0"><Card><PrepIntakeTab companyId={deal.company_id} /></Card></TabsContent>
          <TabsContent value="history" className="mt-0"><Card><HistoryTab dealId={deal.id} fields={fields} stages={stages} /></Card></TabsContent>
        </div>
      </Tabs>

      <AppointmentDialog open={!!planType} onClose={() => setPlanType(null)} deal={deal} type={planType ?? 'call'} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deal verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deal.title}" gaat met activiteiten en afspraken naar de prullenbak; daar kun je het terugzetten. Gekoppelde facturen blijven bestaan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteDeal.mutate(deal.id, { onSuccess: onClose })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="glass-card min-w-0 p-4 shadow-[0_1px_2px_rgba(27,36,48,0.04)]">{children}</div>;
}
