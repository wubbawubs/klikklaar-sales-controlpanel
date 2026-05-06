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
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

const LS_KEY = 'kk-active-org';

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

  return (
    <OrganizationContext.Provider value={{ current, available, loading, switchTo, hasModule }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) throw new Error('useOrganization must be used within OrganizationProvider');
  return ctx;
}
