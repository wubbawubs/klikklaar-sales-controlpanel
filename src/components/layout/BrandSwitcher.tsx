import { Check, ChevronsUpDown, Building2 } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export function BrandSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { current, available, switchTo } = useOrganization();
  if (!current || available.length <= 1) {
    if (!current) return null;
    // Single brand, show static label
    return (
      <div className={cn('flex items-center gap-2 px-2 py-1.5', collapsed && 'justify-center px-0')}>
        {current.logo_url ? (
          <img src={current.logo_url} alt={current.name} className="h-6 w-6 rounded object-contain bg-white/10 p-0.5" />
        ) : (
          <Building2 className="h-4 w-4 text-sidebar-foreground/60" />
        )}
        {!collapsed && <span className="text-xs font-medium text-sidebar-foreground/80 truncate">{current.name}</span>}
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-hover text-sidebar-foreground/85 transition-colors',
            collapsed && 'justify-center px-0'
          )}
        >
          {current.logo_url ? (
            <img src={current.logo_url} alt={current.name} className="h-6 w-6 rounded object-contain bg-white/10 p-0.5" />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-xs font-semibold truncate">{current.name}</span>
              <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs">Wissel merk</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {available.map(o => (
          <DropdownMenuItem key={o.id} onClick={() => switchTo(o.id)} className="gap-2">
            {o.logo_url ? (
              <img src={o.logo_url} alt={o.name} className="h-5 w-5 rounded object-contain" />
            ) : (
              <span className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-bold text-white"
                style={{ backgroundColor: o.primary_color_hex ?? '#0F9B7A' }}>
                {o.name.charAt(0)}
              </span>
            )}
            <span className="flex-1 truncate">{o.name}</span>
            {current.id === o.id && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
