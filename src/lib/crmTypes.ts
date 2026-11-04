// Typed results for CRM tables/RPCs that are not in the (stale) generated Supabase types.

export type StageType = 'open' | 'won' | 'lost';

export interface Funnel {
  id: string; org_id: string; name: string; position: number;
  amount_mode: 'fixed' | 'range' | 'none';
  archived_at: string | null; created_at: string; updated_at: string;
}

export interface Stage {
  id: string; org_id?: string; name: string; position: number; color: string;
  funnel_id: string | null; stage_type: StageType;
}

export type CrmFieldType = 'text' | 'long_text' | 'number' | 'money' | 'date' | 'choice' | 'yes_no';
export interface CrmFieldOption { id: string; label: string; position: number; archived?: boolean }

export interface CrmField {
  id: string; org_id: string; entity: 'deal' | 'company' | 'contact'; funnel_id: string | null;
  key: string; label: string; type: CrmFieldType; options: CrmFieldOption[];
  builtin: boolean; enabled: boolean; position: number;
  archived_at: string | null; created_at: string; updated_at: string;
}

/** CRM columns on deals (plan 1 migrations); Deal in usePipeline extends this. */
export interface DealCrm {
  value_eur: number | null;
  value_min_eur?: number | null; value_max_eur?: number | null;
  win_chance?: number | null; priority?: string | null; country?: string | null;
  planned_start?: string | null; lead_source?: string | null; category?: string | null;
  description?: string | null;
  custom?: Record<string, unknown> | null;
  billing_type_id?: string | null;
  funnel_id?: string | null;
}

export type TrashEntity = 'deals' | 'companies' | 'contacts' | 'deal_activities' | 'crm_appointments' | 'company_items';

export interface TrashItem {
  entity: TrashEntity; record_id: string; label: string | null;
  deleted_at: string; deleted_by: string | null; delete_batch: string | null; batch_size: number;
  /** What the batch holds besides the item itself, per entity (deal_fees: tarieven of trashed deals). */
  batch_counts: Partial<Record<TrashEntity | 'deal_fees', number>>;
}

/** crm_purge result: rows removed, and the storage paths (bucket company-documents) of removed documents. */
export interface PurgeResult { rows: number; files: string[] }

export type TaskType = 'call' | 'email' | 'todo';
export type TaskPriority = 'high' | 'medium' | 'low';
export type TaskStatus = 'open' | 'in_progress' | 'waiting' | 'done' | 'cancelled';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'Open', in_progress: 'Bezig', waiting: 'Wacht op reactie', done: 'Afgerond', cancelled: 'Vervallen',
};
export const TASK_TYPE_LABEL: Record<TaskType, string> = { call: 'Bellen', email: 'E-mail', todo: 'To-do' };
export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = { high: 'Hoog', medium: 'Midden', low: 'Laag' };

export interface Task {
  id: string; org_id: string; title: string; notes: string | null;
  type: TaskType; priority: TaskPriority; status: TaskStatus;
  /** Plain date (yyyy-mm-dd), no timezone. */
  due_date: string | null; due_time: string | null;
  owner_id: string | null; deal_id: string | null; company_id: string | null; contact_id: string | null;
  completed_at: string | null; completed_by: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  deal?: { title: string } | null; company?: { name: string } | null; contact?: { name: string } | null;
}
