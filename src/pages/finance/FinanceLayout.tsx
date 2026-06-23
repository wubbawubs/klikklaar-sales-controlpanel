import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/finance', label: 'Overzicht', end: true },
  { to: '/finance/facturen', label: 'Facturen' },
  { to: '/finance/omzet', label: 'Omzet & Resultaat' },
  { to: '/finance/liquiditeit', label: 'Liquiditeit' },
  { to: '/finance/contracten', label: 'Contracten' },
  { to: '/finance/stripe', label: 'Stripe' },
  { to: '/finance/prognose', label: 'Prognose' },
];

export default function FinanceLayout() {
  return (
    <div>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 pt-4">
        <h1 className="text-lg font-semibold mb-2">Finance</h1>
        <nav className="flex gap-1 overflow-x-auto -mb-px">
          {TABS.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => cn(
                'whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
