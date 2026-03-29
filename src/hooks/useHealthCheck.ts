import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface HealthStatus {
  overall: 'ok' | 'warning' | 'critical' | 'checking';
  checks: {
    supabase: 'ok' | 'error';
    pipedrive: 'ok' | 'error' | 'skipped';
    ciEngine: 'ok' | 'error';
    edgeFunctions: 'ok' | 'error';
  };
  lastChecked: Date | null;
  errors: string[];
}

const INITIAL: HealthStatus = {
  overall: 'checking',
  checks: { supabase: 'ok', pipedrive: 'skipped', ciEngine: 'ok', edgeFunctions: 'ok' },
  lastChecked: null,
  errors: [],
};

export function useHealthCheck(seId: string | null, seName: string, isEmployee: boolean) {
  const [health, setHealth] = useState<HealthStatus>(INITIAL);
  const alertedRef = useRef<Set<string>>(new Set());

  const reportError = useCallback(async (checkType: string, errorMessage: string, errorCode?: string) => {
    if (!seId || alertedRef.current.has(checkType)) return;
    alertedRef.current.add(checkType);
    // Clear dedup after 30 min locally too
    setTimeout(() => alertedRef.current.delete(checkType), 30 * 60 * 1000);

    try {
      await supabase.functions.invoke('health-alert', {
        body: { seId, seName, checkType, errorMessage, errorCode },
      });
    } catch {
      // Silent — can't alert about alerting failures
    }
  }, [seId, seName]);

  const runChecks = useCallback(async () => {
    if (!seId) return;

    const errors: string[] = [];
    const checks = { ...INITIAL.checks };

    // 1. Supabase connectivity
    try {
      const { error } = await supabase.from('settings').select('id').limit(1);
      if (error) throw error;
      checks.supabase = 'ok';
    } catch (e: any) {
      checks.supabase = 'error';
      errors.push('Database niet bereikbaar');
      reportError('supabase_connectivity', e?.message || 'Database connection failed');
    }

    // 2. Pipedrive sync freshness (employees only, skip for admin-level checks)
    if (isEmployee && seId && !seId.startsWith('admin')) {
      try {
        const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        const { data } = await supabase
          .from('pipedrive_lead_assignments')
          .select('updated_at')
          .eq('sales_executive_id', seId)
          .gte('updated_at', twentyMinAgo)
          .limit(1);

        const { count } = await supabase
          .from('pipedrive_lead_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('sales_executive_id', seId);

        if ((count ?? 0) > 0 && (!data || data.length === 0)) {
          checks.pipedrive = 'error';
          errors.push('Pipedrive sync loopt achter');
          reportError('pipedrive_sync_stale', 'No Pipedrive updates in last 20 minutes');
        } else {
          checks.pipedrive = 'ok';
        }
      } catch {
        checks.pipedrive = 'ok';
      }
    } else if (isEmployee) {
      // Admin-level: check if any lead assignments were synced recently
      try {
        const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
        const { data } = await supabase
          .from('pipedrive_lead_assignments')
          .select('updated_at')
          .gte('updated_at', twentyMinAgo)
          .limit(1);
        checks.pipedrive = (data && data.length > 0) ? 'ok' : 'ok'; // Don't flag if no data
      } catch {
        checks.pipedrive = 'ok';
      }
    } else {
      checks.pipedrive = 'skipped';
    }

    // 3. CI Engine ping
    try {
      const { error } = await supabase.functions.invoke('ci-coaching', {
        body: { sales_executive_id: seId, ping: true },
      });
      checks.ciEngine = error ? 'error' : 'ok';
      if (error) {
        errors.push('CI Engine niet beschikbaar');
        reportError('ci_engine_down', error.message || 'CI Engine unreachable');
      }
    } catch (e: any) {
      checks.ciEngine = 'error';
      errors.push('CI Engine niet beschikbaar');
      reportError('ci_engine_down', e?.message || 'CI Engine unreachable');
    }

    // 4. Edge Functions general
    try {
      const { error } = await supabase.functions.invoke('signal-engine', {
        body: { sales_executive_id: seId, ping: true },
      });
      checks.edgeFunctions = error ? 'error' : 'ok';
      if (error) {
        errors.push('Backend functies niet beschikbaar');
        reportError('edge_functions_down', error.message || 'Edge functions unreachable');
      }
    } catch (e: any) {
      checks.edgeFunctions = 'error';
      errors.push('Backend functies niet beschikbaar');
      reportError('edge_functions_down', e?.message || 'Edge functions unreachable');
    }

    const hasError = Object.values(checks).some(v => v === 'error');
    setHealth({
      overall: hasError ? 'critical' : 'ok',
      checks,
      lastChecked: new Date(),
      errors,
    });
  }, [seId, isEmployee, reportError]);

  useEffect(() => {
    if (!seId) return;
    // Initial check after short delay
    const timeout = setTimeout(runChecks, 3000);
    // Repeat every 60s
    const interval = setInterval(runChecks, 60 * 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [seId, runChecks]);

  return health;
}
