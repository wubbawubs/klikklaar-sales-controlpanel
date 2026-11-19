import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ShareMode } from '@/lib/finance/types';

interface FinanceFilterValue {
  companyId: string | 'all';
  setCompanyId: (id: string | 'all') => void;
  mode: ShareMode;
  setMode: (m: ShareMode) => void;
  month: string; // 'YYYY-MM-01'
  setMonth: (m: string) => void;
}

const Ctx = createContext<FinanceFilterValue | null>(null);

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function FinanceFilterProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyId] = useState<string | 'all'>('all');
  const [mode, setMode] = useState<ShareMode>('full');
  const [month, setMonth] = useState<string>(currentMonth);
  const value = useMemo(
    () => ({ companyId, setCompanyId, mode, setMode, month, setMonth }),
    [companyId, mode, month],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFinanceFilter(): FinanceFilterValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFinanceFilter moet binnen FinanceFilterProvider worden gebruikt');
  return v;
}
