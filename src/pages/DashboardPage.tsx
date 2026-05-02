import { Link, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { subDays, subMonths } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useHealthCheck } from '@/hooks/useHealthCheck';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import SEPersonalDashboard from '@/pages/SEPersonalDashboard';
import SEHealthBar from '@/components/dashboard/SEHealthBar';
import AdminHeroKPIs from '@/components/dashboard/AdminHeroKPIs';
import TeamActivityTrend from '@/components/dashboard/TeamActivityTrend';
import ConversionFunnel from '@/components/dashboard/ConversionFunnel';
import RepLeaderboard from '@/components/dashboard/RepLeaderboard';
import OperationalSignals from '@/components/dashboard/OperationalSignals';
import FunnelConversionMatrix from '@/components/dashboard/FunnelConversionMatrix';
import FunnelPerPerson from '@/components/dashboard/FunnelPerPerson';

type Period = 'week' | 'month' | 'quarter';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Maand' },
  { key: 'quarter', label: 'Kwartaal' },
];

function rangeFor(period: Period): { from: Date; to: Date } {
  const to = new Date();
  if (period === 'week') return { from: subDays(to, 7), to };
  if (period === 'month') return { from: subDays(to, 30), to };
  return { from: subMonths(to, 3), to };
}

export default function DashboardPage() {
  const { isAdmin, roles, loading } = useAuth();

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Laden...</div>;
  }

  const isCoachOrAdmin = isAdmin || roles.includes('coach');
  const isCloser = roles.includes('closer');

  if (isCloser && !isCoachOrAdmin && !roles.includes('sales_executive')) {
    return <Navigate to="/closer" replace />;
  }

  if (!isCoachOrAdmin) {
    return <SEPersonalDashboard />;
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const [period, setPeriod] = useState<Period>('week');
  const range = rangeFor(period);
  const health = useHealthCheck('admin-system-check', 'Admin', true);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Performance, trends en signalen van het sales team</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Period switcher */}
          <div className="inline-flex items-center rounded-lg border border-border/60 bg-card p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  period === p.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Link to="/sales-executives/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nieuwe SE</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* System health bar */}
      <SEHealthBar health={health} />

      {/* Hero KPIs */}
      <AdminHeroKPIs from={range.from} to={range.to} />

      {/* Team trend + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <TeamActivityTrend from={range.from} to={range.to} />
        </div>
        <div className="lg:col-span-2">
          <ConversionFunnel from={range.from} to={range.to} />
        </div>
      </div>

      {/* Leaderboard */}
      <RepLeaderboard from={range.from} to={range.to} />

      {/* Funnel conversion matrix (Phase 3 widget A) */}
      <FunnelConversionMatrix from={range.from} to={range.to} />

      {/* Funnel per person (Phase 3 widget C) */}
      <FunnelPerPerson from={range.from} to={range.to} />

      {/* Operational signals */}
      <OperationalSignals />
    </div>
  );
}
