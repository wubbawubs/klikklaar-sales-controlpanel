import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgId } from '@/hooks/useOrgId';
import { useStages } from '@/hooks/usePipeline';
import { toast } from 'sonner';

// Logical fields we can import into. The UI maps CSV columns onto these.
export const IMPORT_FIELDS = [
  { key: 'company', label: 'Bedrijf' },
  { key: 'contact', label: 'Contactpersoon' },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefoon' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'title', label: 'Deal / titel' },
  { key: 'value', label: 'Waarde (€)' },
  { key: 'stage', label: 'Stage' },
  { key: 'status', label: 'Status (won/lost/open)' },
] as const;
export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key'];
export type Mapping = Partial<Record<ImportFieldKey, string>>; // field -> csv column

// Best-guess mapping from common Pipedrive export headers.
const HEADER_HINTS: Record<ImportFieldKey, RegExp> = {
  company: /^(organi[sz]ation|organisatie|company|bedrijf)/i,
  contact: /^(contact person|person|contactpersoon|naam|name)/i,
  email: /e-?mail/i,
  phone: /(phone|telefoon|tel)/i,
  linkedin: /linkedin/i,
  title: /^(title|deal title|titel|deal)/i,
  value: /(value|waarde|amount|bedrag)/i,
  stage: /^(stage|fase|stadium)/i,
  status: /^(status)/i,
};

export function autoMap(headers: string[]): Mapping {
  const m: Mapping = {};
  for (const f of IMPORT_FIELDS) {
    const hit = headers.find(h => HEADER_HINTS[f.key].test(h));
    if (hit) m[f.key] = hit;
  }
  return m;
}

export interface ImportResult { companies: number; contacts: number; deals: number; skipped: number }

function parseValue(raw: string): number | null {
  if (!raw) return null;
  // strip currency symbols / thousands separators; handle "1.234,56" and "1,234.56"
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  const n = Number(cleaned.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function useImportRows() {
  const orgId = useOrgId();
  const { data: stages = [] } = useStages();

  return useMutation({
    mutationFn: async ({ rows, mapping }: { rows: Record<string, string>[]; mapping: Mapping }): Promise<ImportResult> => {
      if (!orgId) throw new Error('Geen actief bedrijf geselecteerd');
      const get = (row: Record<string, string>, f: ImportFieldKey) => (mapping[f] ? (row[mapping[f]!] ?? '').trim() : '');

      const firstStage = stages[0];
      const stageByName = new Map(stages.map(s => [s.name.toLowerCase(), s]));
      const wonStage = stages.find(s => /won|gewonnen/i.test(s.name));
      const lostStage = stages.find(s => /lost|verloren/i.test(s.name));

      // Cache companies/contacts within this run to dedupe.
      const companyCache = new Map<string, string>(); // name(lower) -> id
      const contactCache = new Map<string, string>(); // email(lower) -> id
      const result: ImportResult = { companies: 0, contacts: 0, deals: 0, skipped: 0 };

      // Preload existing companies/contacts for dedupe.
      const { data: existingCompanies } = await supabase.from('companies').select('id, name').eq('org_id', orgId);
      for (const c of existingCompanies ?? []) companyCache.set((c.name as string).toLowerCase(), c.id as string);
      const { data: existingContacts } = await supabase.from('contacts').select('id, email').eq('org_id', orgId).not('email', 'is', null);
      for (const c of existingContacts ?? []) if (c.email) contactCache.set((c.email as string).toLowerCase(), c.id as string);

      for (const row of rows) {
        const companyName = get(row, 'company');
        const contactName = get(row, 'contact');
        const email = get(row, 'email');
        const title = get(row, 'title') || companyName || contactName;
        if (!title) { result.skipped++; continue; }

        // Company (dedupe by name)
        let companyId: string | null = null;
        if (companyName) {
          const key = companyName.toLowerCase();
          companyId = companyCache.get(key) ?? null;
          if (!companyId) {
            const { data } = await supabase.from('companies').insert({ org_id: orgId, name: companyName, email: email || null }).select('id').single();
            if (data) { companyId = data.id; companyCache.set(key, data.id); result.companies++; }
          }
        }

        // Contact (dedupe by email)
        let contactId: string | null = null;
        if (contactName || email) {
          const key = email.toLowerCase();
          if (email && contactCache.has(key)) contactId = contactCache.get(key)!;
          else {
            const { data } = await supabase.from('contacts').insert({
              org_id: orgId, company_id: companyId,
              name: contactName || email || 'Onbekend',
              email: email || null, phone: get(row, 'phone') || null, linkedin: get(row, 'linkedin') || null,
            }).select('id').single();
            if (data) { contactId = data.id; if (email) contactCache.set(key, data.id); result.contacts++; }
          }
        }

        // Stage + status
        const status = get(row, 'status').toLowerCase();
        const isWon = /won|gewonnen/.test(status);
        const isLost = /lost|verloren/.test(status);
        const stageName = get(row, 'stage').toLowerCase();
        let stage = stageByName.get(stageName);
        if (isWon && wonStage) stage = wonStage;
        if (isLost && lostStage) stage = lostStage;
        if (!stage) stage = firstStage;

        const deal: Record<string, unknown> = {
          org_id: orgId, title, value_eur: parseValue(get(row, 'value')),
          stage_id: stage?.id ?? null, company_id: companyId, contact_id: contactId,
        };
        if (isWon) deal.won_at = new Date().toISOString();
        if (isLost) deal.lost_at = new Date().toISOString();

        const { error } = await supabase.from('deals').insert(deal);
        if (error) result.skipped++; else result.deals++;
      }

      return result;
    },
    onSuccess: (r) => toast.success(`Geïmporteerd: ${r.deals} deals, ${r.companies} bedrijven, ${r.contacts} contacten`),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Import mislukt'),
  });
}
