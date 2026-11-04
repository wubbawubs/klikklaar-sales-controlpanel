import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Plus, Search, X } from 'lucide-react';
import { useFunnel, useFunnelFields, useFunnels } from '@/hooks/useFunnels';
import { useDeals, useMoveDeal, useStages, type Stage } from '@/hooks/usePipeline';
import { useAgenda, type Appointment } from '@/hooks/useAppointments';
import { useTeamMembers } from '@/hooks/useBoards';
import { useOrganization } from '@/hooks/useOrganization';
import { DealPanel } from '@/components/deal/DealPanel';
import { FunnelBoard } from '@/components/funnel/FunnelBoard';
import { KpiTiles } from '@/components/funnel/KpiTiles';
import { FunnelTable } from '@/components/funnel/FunnelTable';
import { LeadDialog, NewDealDialog } from '@/components/funnel/DealDialogs';
import { cn } from '@/lib/utils';
import PipelinePage from './PipelinePage';

type View = 'board' | 'list';

// The chosen view is remembered per funnel; storage may be unavailable (private mode), so never throw.
const viewKey = (funnelId: string) => `kk-funnel-view:${funnelId}`;
function readView(funnelId: string): View {
  try {
    return localStorage.getItem(viewKey(funnelId)) === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
}
function writeView(funnelId: string, view: View) {
  try {
    localStorage.setItem(viewKey(funnelId), view);
  } catch {
    /* ignore */
  }
}

function Spinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none" />
    </div>
  );
}

/** `/pipeline`: open the org's first funnel; the legacy board is the fallback (no funnel, or the group view). */
export function PipelineIndex() {
  const { isAllView } = useOrganization();
  const { data: funnels, isLoading } = useFunnels();
  const location = useLocation();
  if (isAllView) return <PipelinePage />;
  if (isLoading) return <Spinner />;
  const first = funnels?.[0];
  if (!first) return <PipelinePage />;
  return <Navigate to={`/pipeline/${first.id}${location.search}`} replace />;
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opt = (v: View, label: string, Icon: typeof List) => (
    <button
      type="button"
      role="radio"
      aria-checked={view === v}
      onClick={() => onChange(v)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition-colors motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        view === v
          ? 'bg-white font-semibold text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-muted'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label="Weergave" className="flex rounded-full bg-black/[0.05] p-0.5 dark:bg-white/[0.07]">
      {opt('board', 'Bord', LayoutGrid)}
      {opt('list', 'Lijst', List)}
    </div>
  );
}

export default function FunnelPage() {
  const { funnelId = '' } = useParams<{ funnelId: string }>();
  const { isAllView } = useOrganization();
  const { data: funnel, isLoading: funnelLoading } = useFunnel(funnelId);
  const { data: fields = [] } = useFunnelFields(funnelId);
  const { data: stages = [] } = useStages(funnelId);
  const { data: deals = [], isLoading: dealsLoading } = useDeals(funnelId);
  const { data: agenda = [] } = useAgenda();
  const { data: team = [] } = useTeamMembers();
  const moveDeal = useMoveDeal();

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('deal');
  const openDeal = (id: string) => setSearchParams(p => { p.set('deal', id); return p; });
  const closeDeal = () => setSearchParams(p => { p.delete('deal'); return p; });

  const [view, setViewState] = useState<View>(() => readView(funnelId));
  useEffect(() => { setViewState(readView(funnelId)); }, [funnelId]);
  const setView = (v: View) => { setViewState(v); writeView(funnelId, v); };
  const [newDealFor, setNewDealFor] = useState<Stage | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search box (unless already typing somewhere)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nextByDeal = useMemo(() => {
    const m = new Map<string, Appointment>();
    for (const a of agenda) if (a.deal_id && !m.has(a.deal_id)) m.set(a.deal_id, a); // agenda is sorted by starts_at
    return m;
  }, [agenda]);

  const names = useMemo(() => new Map(team.map(t => [t.user_id, t.full_name || t.email || null])), [team]);
  const ownerName = useCallback((id: string | null) => (id ? names.get(id) ?? null : null), [names]);

  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.position - b.position), [stages]);

  const q = search.trim().toLowerCase();
  const visibleDeals = q
    ? deals.filter(d =>
        [d.title, d.company?.name, d.contact?.name, d.contact?.email, d.contact?.phone]
          .some(v => v?.toLowerCase().includes(q)))
    : deals;

  // The group view has no single org to write to: show the read-only legacy overview.
  if (isAllView) return <Navigate to="/pipeline" replace />;
  if (funnelLoading) return <Spinner />;
  if (!funnel) return <Navigate to="/pipeline" replace />;

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-3 lg:px-0 lg:pt-3">
      {/* Title bar */}
      <div className="glass flex flex-wrap items-center gap-x-3 gap-y-2 !rounded-[22px] py-2 pl-4 pr-2 shadow-[0_8px_30px_-12px_rgba(30,50,40,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-none sm:!rounded-full">
        <h1 className="min-w-0 truncate text-[17px] font-semibold tracking-[-0.015em] text-foreground">{funnel.name}</h1>
        <ViewToggle view={view} onChange={setView} />
        <div className="hidden flex-1 sm:block" />
        <div className="relative order-last w-full sm:order-none sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            placeholder="Zoeken"
            aria-label="Zoek deal, bedrijf of contact"
            className="h-8 w-full rounded-full border-0 bg-black/[0.05] pl-8 pr-8 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-white/[0.07] [&::-webkit-search-cancel-button]:hidden"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && (setSearch(''), e.currentTarget.blur())}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Zoekopdracht wissen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setLeadOpen(true)}
          disabled={sortedStages.length === 0}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground shadow-[0_4px_14px_-4px_hsl(var(--primary)),inset_0_1px_0_rgba(255,255,255,0.35)] transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 sm:ml-0"
        >
          <Plus className="h-4 w-4" aria-hidden /> Nieuwe deal
        </button>
      </div>

      <KpiTiles deals={deals} stages={sortedStages} funnel={funnel} fields={fields} />

      {q && (
        <p className="px-1 text-[12px] text-muted-foreground" aria-live="polite">
          {visibleDeals.length} van {deals.length} deals gevonden
        </p>
      )}

      {dealsLoading ? (
        <Spinner />
      ) : sortedStages.length === 0 ? (
        <div className="glass p-8 text-center text-sm text-muted-foreground">
          Deze funnel heeft nog geen fases. Voeg ze toe via Instellingen.
        </div>
      ) : view === 'list' ? (
        <FunnelTable
          deals={visibleDeals}
          stages={sortedStages}
          funnel={funnel}
          fields={fields}
          ownerName={ownerName}
          onOpenDeal={openDeal}
        />
      ) : (
        <FunnelBoard
          stages={sortedStages}
          deals={visibleDeals}
          funnel={funnel}
          fields={fields}
          ownerName={ownerName}
          nextByDeal={nextByDeal}
          onOpenDeal={openDeal}
          onAddDeal={setNewDealFor}
          onMoveDeal={(dealId, fromStage, toStage) => moveDeal.mutate({ dealId, fromStage, toStage })}
        />
      )}

      {newDealFor && (
        <NewDealDialog
          stageId={newDealFor.id}
          stageName={newDealFor.name}
          amountMode={funnel.amount_mode}
          open={!!newDealFor}
          onClose={() => setNewDealFor(null)}
        />
      )}
      {sortedStages.length > 0 && (
        <LeadDialog
          key={funnelId}
          open={leadOpen}
          onClose={() => setLeadOpen(false)}
          stages={sortedStages}
          defaultStageId={sortedStages[0]!.id}
          amountMode={funnel.amount_mode}
        />
      )}

      <DealPanel dealId={selectedId} funnelId={funnelId} open={!!selectedId} onOpenChange={o => { if (!o) closeDeal(); }} />
    </div>
  );
}
