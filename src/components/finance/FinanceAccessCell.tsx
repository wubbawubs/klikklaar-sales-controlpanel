import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  useFinanceAccessAll, useFinanceCompanies, useSetCompanyAccess, useSetFinanceLevel,
} from '@/hooks/useFinance';

/** Finance-toegang van één gebruiker; alleen voor super_admin-kijkers renderen (de RLS dwingt dit ook af). */
export function FinanceAccessCell({ userId, isSuperAdminUser }: { userId: string; isSuperAdminUser: boolean }) {
  const accessQ = useFinanceAccessAll();
  const companiesQ = useFinanceCompanies({ includeExcluded: true });
  const setLevel = useSetFinanceLevel();
  const setCompany = useSetCompanyAccess();

  if (isSuperAdminUser) return <span className="text-xs text-muted-foreground">Altijd alles (super admin)</span>;

  const level = accessQ.data?.access.find((a) => a.user_id === userId)?.level ?? 'none';
  const granted = new Set((accessQ.data?.companyAccess ?? []).filter((r) => r.user_id === userId).map((r) => r.company_id));
  const companies = companiesQ.data ?? [];

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Finance-toegang"
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        value={level}
        disabled={setLevel.isPending}
        onChange={(e) => setLevel.mutate({ userId, level: e.target.value as 'none' | 'view' | 'manage' })}
      >
        <option value="none">Geen</option>
        <option value="view">Kijken</option>
        <option value="manage">Beheren</option>
      </select>
      {level !== 'none' && (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 text-xs">Bedrijven ({granted.size})</Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-2">
            {companies.length === 0 && <p className="text-xs text-muted-foreground">Geen finance-bedrijven.</p>}
            {companies.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  aria-label={c.name}
                  checked={granted.has(c.id)}
                  onCheckedChange={(v) => setCompany.mutate({ userId, companyId: c.id, enabled: v === true })}
                />
                <span>{c.name}{c.excluded && <span className="ml-1 text-xs text-muted-foreground">(uitgesloten)</span>}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
