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

export type TrashEntity = 'deals' | 'companies' | 'contacts' | 'deal_activities' | 'crm_appointments' | 'company_items';

export interface TrashItem {
  entity: TrashEntity; record_id: string; label: string | null;
  deleted_at: string; deleted_by: string | null; delete_batch: string | null; batch_size: number;
  /** What the batch holds besides the item itself, per entity (deal_fees: tarieven of trashed deals). */
  batch_counts: Partial<Record<TrashEntity | 'deal_fees', number>>;
}

/** crm_purge result: rows removed, and the storage paths (bucket company-documents) of removed documents. */
export interface PurgeResult { rows: number; files: string[] }
