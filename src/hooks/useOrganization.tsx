import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Organization {
  id: string;
  slug: string;
  name: string;
  subdomain: string | null;
  logo_url: string | null;
  primary_color_hex: string | null;
  accent_color_hex: string | null;
  modules: string[];
  active: boolean;
}

interface OrganizationContextType {
  current: Organization | null;
  available: Organization[];
  loading: boolean;
  switchTo: (orgId: string) => void;
  hasModule: (mod: string) => boolean;
  reload: () => Promise<void>;
  createOrganization: (input: { name: string; color?: string }) => Promise<Organization>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

const LS_KEY = 'kk-active-org';
const DEFAULT_MODULES = ['dashboard', 'pipeline', 'boards', 'contacts', 'leads', 'forecasting'];

function slugify(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'crm';
}

function detectSubdomain(): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  // ignore lovable preview hosts and localhost
  if (host.includes('lovable.app') || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return null;
  }
  const parts = host.split('.');
  if (parts.length < 3) return null;
  return parts[0];
}

function isProductionHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('klikklaarseo.nl');
}

const SUBDOMAIN_REDIRECT_KEY = 'kk-org-redirect-attempted';

function applyTheme(org: Organization | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!org) {
    root.style.removeProperty('--brand-primary');
    root.style.removeProperty('--brand-accent');
    return;
  }
  if (org.primary_color_hex) root.style.setProperty('--brand-primary', org.primary_color_hex);
  if (org.accent_color_hex) root.style.setProperty('--brand-accent', org.accent_color_hex);
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const [available, setAvailable] = useState<Organization[]>([]);
  const [current, setCurrent] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setAvailable([]);
      setCurrent(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Admins see all orgs; non-admins only their memberships
    let orgs: Organization[] = [];
    if (isAdmin) {
      const { data } = await supabase.from('organizations').select('*').eq('active', true).order('name');
      orgs = (data ?? []) as Organization[];
    } else {
      const { data } = await supabase
        .from('user_organizations')
        .select('is_default, organizations:organization_id(*)')
        .eq('user_id', user.id);
      orgs = (data ?? [])
        .map((r: any) => r.organizations)
        .filter((o: any) => o && o.active) as Organization[];
    }

    setAvailable(orgs);

    // Resolution priority: subdomain match -> localStorage -> default membership -> first
    const sub = detectSubdomain();
    const stored = localStorage.getItem(LS_KEY);
    let active: Organization | null = null;

    if (sub) active = orgs.find(o => o.subdomain === sub) ?? null;

    // Auto-redirect: on production, if user landed on a subdomain they have NO access to,
    // forward them to their default brand subdomain (one-shot to avoid loops).
    if (!active && sub && isProductionHost() && !isAdmin && orgs.length > 0) {
      const alreadyTried = sessionStorage.getItem(SUBDOMAIN_REDIRECT_KEY);
      if (!alreadyTried) {
        const { data: defMem } = await supabase
          .from('user_organizations')
          .select('organization_id')
          .eq('user_id', user.id)
          .eq('is_default', true)
          .maybeSingle();
        const target = orgs.find(o => o.id === defMem?.organization_id) ?? orgs[0];
        if (target?.subdomain && target.subdomain !== sub) {
          sessionStorage.setItem(SUBDOMAIN_REDIRECT_KEY, '1');
          window.location.href = `https://${target.subdomain}.klikklaarseo.nl/`;
          return;
        }
      }
    }

    if (!active && stored) active = orgs.find(o => o.id === stored) ?? null;
    if (!active && !isAdmin && user) {
      const { data: defMem } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .maybeSingle();
      if (defMem) active = orgs.find(o => o.id === defMem.organization_id) ?? null;
    }
    if (!active) active = orgs[0] ?? null;

    // Clear redirect guard once we successfully landed on a valid org
    if (active) sessionStorage.removeItem(SUBDOMAIN_REDIRECT_KEY);

    setCurrent(active);
    applyTheme(active);
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const switchTo = useCallback((orgId: string) => {
    const next = available.find(o => o.id === orgId);
    if (!next) return;
    localStorage.setItem(LS_KEY, orgId);
    setCurrent(next);
    applyTheme(next);
  }, [available]);

  const hasModule = useCallback((mod: string) => {
    if (!current) return true; // fallback open until loaded
    return current.modules?.includes(mod) ?? false;
  }, [current]);

  const createOrganization = useCallback(async ({ name, color }: { name: string; color?: string }) => {
    if (!user) throw new Error('Niet ingelogd');
    let slug = slugify(name);
    // Insert org; on slug collision retry with a short suffix.
    let inserted: Organization | null = null;
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const trySlug = attempt === 0 ? slug : `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase
        .from('organizations')
        .insert({
          name: name.trim(),
          slug: trySlug,
          primary_color_hex: color ?? '#0F9B7A',
          accent_color_hex: color ?? '#0F9B7A',
          modules: DEFAULT_MODULES,
          active: true,
        })
        .select('*')
        .single();
      if (!error) { inserted = data as Organization; break; }
      if (!/duplicate|unique/i.test(error.message)) throw error;
    }
    if (!inserted) throw new Error('Kon CRM niet aanmaken (slug bestaat al)');

    // Make the creator an owner member so it persists and resolves.
    await supabase.from('user_organizations').insert({
      user_id: user.id, organization_id: inserted.id, role: 'owner',
    });

    // Seed a default Pipedrive-style pipeline so the new CRM is usable immediately.
    await supabase.from('pipeline_stages').insert([
      { org_id: inserted.id, name: 'Prospect', position: 1, color: '#6B7280' },
      { org_id: inserted.id, name: 'Gecontacteerd', position: 2, color: '#3B82F6' },
      { org_id: inserted.id, name: 'Voorstel', position: 3, color: '#F59E0B' },
      { org_id: inserted.id, name: 'Onderhandeling', position: 4, color: '#EC4899' },
      { org_id: inserted.id, name: 'Won', position: 5, color: '#10B981' },
      { org_id: inserted.id, name: 'Verloren', position: 6, color: '#EF4444' },
    ]);

    // Seed default fee types so deals can be billed immediately.
    await supabase.from('billing_types').insert([
      { org_id: inserted.id, name: 'Eenmalig', kind: 'one_time', interval: null, position: 1 },
      { org_id: inserted.id, name: 'Maandelijks', kind: 'recurring', interval: 'month', position: 2 },
      { org_id: inserted.id, name: 'Startfee', kind: 'one_time', interval: null, position: 3 },
      { org_id: inserted.id, name: 'Plaatsingsfee', kind: 'one_time', interval: null, position: 4 },
    ]);

    await load();
    switchTo(inserted.id);
    return inserted;
  }, [user, load, switchTo]);

  return (
    <OrganizationContext.Provider value={{ current, available, loading, switchTo, hasModule, reload: load, createOrganization }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) throw new Error('useOrganization must be used within OrganizationProvider');
  return ctx;
}
