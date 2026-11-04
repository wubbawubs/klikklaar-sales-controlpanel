import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { Deal } from '@/hooks/usePipeline';
import type { CrmField, Funnel, Stage } from '@/lib/crmTypes';
import { displayValue, fieldValue, formatAmount, visibleFields } from '@/lib/dealFields';
import { cn } from '@/lib/utils';
import { accentChip, initials } from './funnelFormat';

export interface FunnelTableProps {
  deals: Deal[];
  stages: Stage[];
  funnel: Funnel;
  fields: CrmField[];
  ownerName: (userId: string | null) => string | null;
  onOpenDeal: (dealId: string) => void;
}

type Raw = string | number | boolean | null | undefined;
interface Column {
  id: string;
  label: string;
  numeric?: boolean;
  raw: (d: Deal) => Raw;
  cell: (d: Deal) => ReactNode;
  className?: string;
}
type SortDir = 'asc' | 'desc';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const empty = (v: Raw) => v === null || v === undefined || v === '';

/** Midpoint of a deal's amount (range) or its value; null when unknown. */
function amountRaw(d: Deal, funnel: Funnel): number | null {
  if (funnel.amount_mode === 'range' && isNum(d.value_min_eur) && isNum(d.value_max_eur)) return (d.value_min_eur + d.value_max_eur) / 2;
  return isNum(d.value_eur) ? d.value_eur : null;
}

function compare(a: Raw, b: Raw): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'nl', { numeric: true, sensitivity: 'base' });
}

const Muted = () => <span className="text-muted-foreground/60" aria-label="Leeg">–</span>;

function fieldColumn(f: CrmField, funnel: Funnel): Column | null {
  if (f.builtin && f.key === 'amount') {
    if (funnel.amount_mode === 'none') return null;
    return {
      id: f.id, label: f.label, numeric: true,
      raw: d => amountRaw(d, funnel),
      cell: d => formatAmount(d, funnel) ?? <Muted />,
      className: 'font-semibold',
    };
  }
  if (f.builtin && f.key === 'win_chance') {
    return {
      id: f.id, label: f.label, numeric: true,
      raw: d => (isNum(d.win_chance) ? d.win_chance : null),
      cell: d => (isNum(d.win_chance)
        ? (
          <span className="inline-flex items-center justify-end gap-2">
            <span className="h-[5px] w-10 overflow-hidden rounded-[3px] bg-black/[0.07] dark:bg-white/10" aria-hidden>
              <span className="block h-full rounded-[3px] bg-primary" style={{ width: `${Math.max(0, Math.min(100, d.win_chance))}%` }} />
            </span>
            <span className={cn('rounded-full px-[7px] py-[1px] text-[11px] font-semibold', accentChip)}>{d.win_chance}%</span>
          </span>
        )
        : <Muted />),
    };
  }
  const numeric = f.type === 'number' || f.type === 'money';
  return {
    id: f.id, label: f.label, numeric,
    raw: d => {
      const v = fieldValue(d, f);
      if (f.type === 'choice') return displayValue(f, v); // sort by the current option label
      return v as Raw;
    },
    cell: d => displayValue(f, fieldValue(d, f)) ?? <Muted />,
    className: f.type === 'long_text' ? 'max-w-[260px] truncate' : undefined,
  };
}

export function FunnelTable({ deals, stages, funnel, fields, ownerName, onOpenDeal }: FunnelTableProps) {
  const [sort, setSort] = useState<{ id: string; dir: SortDir } | null>(null);

  const columns = useMemo<Column[]>(() => {
    const stageById = new Map(stages.map(s => [s.id, s]));
    return [
      {
        id: 'deal', label: 'Deal', raw: d => d.title,
        cell: d => <span className="block max-w-[280px] truncate font-semibold text-foreground" title={d.title}>{d.title}</span>,
      },
      {
        id: 'company', label: 'Bedrijf', raw: d => d.company?.name,
        cell: d => (d.company?.name ? <span className="block max-w-[220px] truncate">{d.company.name}</span> : <Muted />),
      },
      {
        id: 'stage', label: 'Fase', raw: d => (d.stage_id ? stageById.get(d.stage_id)?.position : null),
        cell: d => {
          const s = d.stage_id ? stageById.get(d.stage_id) : undefined;
          if (!s) return <Muted />;
          return (
            <span className="inline-flex max-w-[220px] items-center gap-1.5">
              <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
              <span className="truncate" title={s.name}>{s.name}</span>
            </span>
          );
        },
      },
      ...visibleFields(fields).map(f => fieldColumn(f, funnel)).filter((c): c is Column => !!c),
      {
        id: 'owner', label: 'Eigenaar', raw: d => ownerName(d.assigned_to),
        cell: d => {
          const n = ownerName(d.assigned_to);
          if (!n) return <Muted />;
          return (
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,hsl(var(--primary)),color-mix(in_srgb,hsl(var(--primary))_55%,black))] text-[9px] font-bold text-white" aria-hidden>
                {initials(n)}
              </span>
              <span className="max-w-[160px] truncate">{n}</span>
            </span>
          );
        },
      },
    ];
  }, [stages, fields, funnel, ownerName]);

  const rows = useMemo(() => {
    const col = sort && columns.find(c => c.id === sort.id);
    if (!col || !sort) return deals;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...deals].sort((a, b) => {
      const va = col.raw(a), vb = col.raw(b);
      if (empty(va) && empty(vb)) return 0;
      if (empty(va)) return 1; // empty values always last
      if (empty(vb)) return -1;
      return sign * compare(va, vb);
    });
  }, [deals, columns, sort]);

  const cycle = (id: string) =>
    setSort(s => (s?.id !== id ? { id, dir: 'asc' } : s.dir === 'asc' ? { id, dir: 'desc' } : null));

  return (
    <div className="glass overflow-hidden shadow-[0_8px_30px_-12px_rgba(30,50,40,0.18),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-none">
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full min-w-max border-separate border-spacing-0 text-[12.5px] tabular-nums">
          <thead>
            <tr>
              {columns.map((c, i) => {
                const dir = sort?.id === c.id ? sort.dir : null;
                const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ChevronsUpDown;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                    className={cn(
                      'border-b border-black/[0.06] bg-white/40 px-3 py-2 text-[11.5px] font-medium text-muted-foreground dark:border-border/60 dark:bg-transparent',
                      c.numeric ? 'text-right' : 'text-left',
                      i === 0 && 'pl-4',
                      i === columns.length - 1 && 'pr-4',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => cycle(c.id)}
                      className={cn(
                        'group/sort inline-flex items-center gap-1 rounded-md -mx-1 px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        c.numeric && 'flex-row-reverse',
                        dir && 'text-foreground',
                      )}
                    >
                      {c.label}
                      <Icon className={cn('h-3 w-3 shrink-0', !dir && 'opacity-0 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60')} aria-hidden />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(d => (
              <tr
                key={d.id}
                tabIndex={0}
                onClick={() => onOpenDeal(d.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDeal(d.id); } }}
                className="group/row cursor-pointer outline-none transition-colors hover:bg-white/60 focus-visible:bg-white/70 focus-visible:shadow-[inset_3px_0_0_hsl(var(--primary))] dark:hover:bg-muted/40 dark:focus-visible:bg-muted/50"
              >
                {columns.map((c, i) => (
                  <td
                    key={c.id}
                    className={cn(
                      'whitespace-nowrap border-b border-black/[0.045] px-3 py-2.5 text-foreground group-last/row:border-b-0 dark:border-border/40',
                      c.numeric ? 'text-right' : 'text-left',
                      i === 0 && 'pl-4',
                      i === columns.length - 1 && 'pr-4',
                      c.className,
                    )}
                  >
                    {c.cell(d)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">Geen deals gevonden</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
