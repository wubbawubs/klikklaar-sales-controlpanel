export type ShareMode = 'full' | 'share';

export interface FinanceCompany {
  id: string;
  exact_division: number | null;
  name: string;
  legal_name: string | null;
  ownership_pct: number;
  min_buffer: number;
  excluded: boolean;
  last_synced_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlyRow {
  company_id: string;
  month: string; // 'YYYY-MM-01'
  revenue: number;
  costs: number;
  synced_at: string | null;
}

export interface BankAccount {
  id: string;
  company_id: string;
  account_code: string;
  name: string;
  balance: number;
  last_statement_date: string | null;
  synced_at: string | null;
}

export interface OpenItem {
  id: string;
  company_id: string;
  kind: 'receivable' | 'payable' | null;
  exact_id: string;
  invoice_number: string | null;
  counterparty: string;
  amount: number;
  invoice_date: string | null;
  due_date: string | null;
  synced_at: string | null;
}

export interface Target {
  company_id: string;
  month: string;
  target: number;
}

export type FixedCostCategory =
  | 'personeel'
  | 'huisvesting'
  | 'software'
  | 'marketing'
  | 'verzekeringen'
  | 'advies'
  | 'overig';

export interface FixedCost {
  id: string;
  company_id: string;
  name: string;
  category: FixedCostCategory;
  monthly_amount: number;
  exact_supplier_code: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierSpend {
  company_id: string;
  supplier_code: string;
  supplier_name: string | null;
  last_invoice_date: string | null;
  last_amount: number | null;
}
