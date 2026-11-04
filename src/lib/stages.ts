// Won/lost is decided by pipeline_stages.stage_type only — never by the stage name.
import type { StageType } from './crmTypes';

type Typed = { stage_type?: StageType | string | null } | null | undefined;

export const isWonStage = (s: Typed): boolean => s?.stage_type === 'won';
export const isLostStage = (s: Typed): boolean => s?.stage_type === 'lost';
export const isClosedStage = (s: Typed): boolean => isWonStage(s) || isLostStage(s);

/** Webhook to fire when a deal moves from `from` to `to`: only on entering a won/lost stage. */
export function outcomeEvent(from: Typed, to: Typed): 'deal.won' | 'deal.lost' | null {
  if (isWonStage(to) && !isWonStage(from)) return 'deal.won';
  if (isLostStage(to) && !isLostStage(from)) return 'deal.lost';
  return null;
}

type ImportableStage = { id: string; name: string; position: number; stage_type?: StageType | string | null };

/**
 * Target stage for an imported (e.g. Pipedrive) row. A won/lost status in the source maps to the first
 * won/lost-typed stage by position; otherwise the stage name is matched; else the first open stage.
 * The import only sets stage_id — the database trigger sets won_at/lost_at from the stage type.
 */
export function importStage<S extends ImportableStage>(stages: S[], row: { status: string; stageName: string }): S | undefined {
  const byPos = [...stages].sort((a, b) => a.position - b.position);
  const status = row.status.trim().toLowerCase();
  if (/won|gewonnen/.test(status)) { const s = byPos.find(isWonStage); if (s) return s; }
  if (/lost|verloren/.test(status)) { const s = byPos.find(isLostStage); if (s) return s; }
  const name = row.stageName.trim().toLowerCase();
  const named = name ? byPos.find(s => s.name.trim().toLowerCase() === name) : undefined;
  return named ?? byPos.find(s => !isClosedStage(s)) ?? byPos[0];
}
