import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ProposalCard } from '@/components/meeting/ProposalCard';
import { useDeals, useStages } from '@/hooks/usePipeline';
import { useTeamMembers } from '@/hooks/useBoards';
import {
  useAllCompanies, useApplyProposal, useMeetingImport, useMeetingProposals, useReanalyze, useSetProposalStatus,
  type MeetingProposal, type ProposalDraft,
} from '@/hooks/useMeetings';
import { groupByCompany, isStuck, proposalBlockers } from '@/lib/meetingProposals';

const draftFrom = (p: MeetingProposal): ProposalDraft => ({ company_id: p.company_id, deal_id: p.deal_id, payload: p.payload ?? {}, confirm_closed: false });

export default function MeetingReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: imp, isLoading } = useMeetingImport(id);
  const ready = imp?.status === 'ready';
  const { data: proposals = [] } = useMeetingProposals(id, ready);
  const { data: deals = [] } = useDeals();
  const { data: stages = [] } = useStages();
  const { data: companies = [] } = useAllCompanies();
  const { data: team = [] } = useTeamMembers();
  const apply = useApplyProposal();
  const setStatus = useSetProposalStatus();
  const reanalyze = useReanalyze();

  const [drafts, setDrafts] = useState<Record<string, ProposalDraft>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState(false);

  // New proposals (first load or after re-analysis) get a draft; existing edits are kept.
  useEffect(() => {
    setDrafts(prev => {
      const next = { ...prev };
      for (const p of proposals) if (!next[p.id]) next[p.id] = draftFrom(p);
      return next;
    });
  }, [proposals]);

  const stageName = (sid: string | null | undefined) => (sid ? stages.find(s => s.id === sid)?.name ?? null : null);
  const draftOf = (p: MeetingProposal) => drafts[p.id] ?? draftFrom(p);
  const isReady = (p: MeetingProposal) => {
    const d = draftOf(p);
    const deal = d.deal_id ? deals.find(x => x.id === d.deal_id) : undefined;
    return (p.status === 'open' || p.status === 'failed')
      && proposalBlockers({ kind: p.kind, company_id: d.company_id, deal_id: d.deal_id, payload: d.payload },
        { dealStageName: stageName(deal?.stage_id), confirmClosed: d.confirm_closed }).length === 0;
  };

  // For a deal the user picked, the server checks against the deal as shown on screen.
  const expectedFor = (d: ProposalDraft) => {
    const deal = d.deal_id ? deals.find(x => x.id === d.deal_id) : undefined;
    return deal ? { stage_id: deal.stage_id, value_eur: deal.value_eur, assigned_to: deal.assigned_to } : null;
  };

  const applyOne = async (p: MeetingProposal): Promise<boolean> => {
    const d = draftOf(p);
    setBusy(b => new Set(b).add(p.id));
    try {
      await apply.mutateAsync({ proposal: p, draft: d, expected: expectedFor(d) });
      return true;
    } catch {
      return false;
    } finally {
      setBusy(b => { const n = new Set(b); n.delete(p.id); return n; });
    }
  };

  const readyList = proposals.filter(isReady);
  const applyAll = async () => {
    setBulk(true);
    let ok = 0; let failed = 0;
    for (const p of readyList) {
      if (await applyOne(p)) ok++; else failed++;
    }
    setBulk(false);
    if (failed) toast.error(`${ok} toegepast, ${failed} mislukt — zie de rode meldingen`);
    else toast.success(`${ok} toegepast`);
  };

  const groups = useMemo(() => groupByCompany(proposals), [proposals]);
  const counts = {
    open: proposals.filter(p => p.status === 'open' || p.status === 'failed').length,
    applied: proposals.filter(p => p.status === 'applied').length,
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Laden…</p>;
  if (!imp) return <p className="text-sm text-muted-foreground">Meeting niet gevonden. <Link className="underline" to="/meetings">Terug</Link></p>;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="space-y-1">
        <Link to="/meetings" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:underline"><ArrowLeft className="h-3 w-3" />Meetings</Link>
        <h1 className="text-xl font-semibold">{imp.title || 'Sales-meeting'}</h1>
        <p className="text-sm text-muted-foreground">{format(new Date(`${imp.meeting_date}T12:00:00`), 'EEEE d MMMM yyyy', { locale: nl })}</p>
      </div>

      {(imp.status === 'analyzing' || imp.status === 'queued') && !isStuck(imp) && (
        <div className="rounded-lg border p-6 flex items-center gap-3 text-sm">
          <Loader2 className="h-5 w-5 animate-spin" />AI leest het transcript… dit duurt meestal 1–2 minuten. Je kunt deze pagina open laten.
        </div>
      )}

      {(imp.status === 'failed' || isStuck(imp)) && (
        <div className="rounded-lg border border-destructive/50 p-4 space-y-2">
          <p className="text-sm text-destructive">{imp.status === 'failed' ? imp.error || 'Analyse mislukt' : 'De analyse lijkt vastgelopen.'}</p>
          <Button size="sm" onClick={() => reanalyze.mutate(imp.id, { onError: e => toast.error((e as Error).message) })} disabled={reanalyze.isPending}>
            Opnieuw analyseren
          </Button>
        </div>
      )}

      {ready && (
        <>
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">{proposals.length} voorstellen · {counts.applied} toegepast · {counts.open} open</span>
            <Button size="sm" onClick={applyAll} disabled={readyList.length === 0 || bulk}>
              {bulk && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Alles toepassen wat klaar is ({readyList.length})
            </Button>
          </div>

          {proposals.length === 0 && <p className="text-sm text-muted-foreground">De AI vond geen wijzigingen in dit transcript.</p>}

          {groups.map(g => (
            <section key={g.label} className="space-y-2">
              <h2 className="text-sm font-semibold">{g.label}</h2>
              {g.items.map(p => (
                <ProposalCard key={p.id} proposal={p} draft={draftOf(p)}
                  onDraftChange={d => setDrafts(prev => ({ ...prev, [p.id]: d }))}
                  onApply={async () => { if (!(await applyOne(p))) toast.error('Niet toegepast — zie de melding bij het voorstel'); }}
                  onDismiss={() => setStatus.mutate({ proposal: p, status: 'dismissed' })}
                  onRestore={() => setStatus.mutate({ proposal: p, status: 'open' })}
                  applying={busy.has(p.id) || bulk}
                  companies={companies} deals={deals} stages={stages} team={team} />
              ))}
            </section>
          ))}

          {counts.applied === 0 && <div className="flex justify-end">
            <Button variant="ghost" size="sm" disabled={reanalyze.isPending}
              onClick={() => reanalyze.mutate(imp.id, { onError: e => toast.error((e as Error).message) })}>
              Opnieuw analyseren
            </Button>
          </div>}
        </>
      )}

      <Collapsible>
        <CollapsibleTrigger asChild><Button variant="link" size="sm" className="px-0">Transcript bekijken</Button></CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="whitespace-pre-wrap text-xs rounded-lg border p-3 max-h-[400px] overflow-auto">{imp.transcript}</pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
