import { useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { DEFAULT_ACCENT, hexToHslTriplet, readableOn } from '@/lib/color';

/** Sets the org accent CSS variables on <html>; --primary/--ring follow it in light mode. */
export function OrgAccent() {
  const { current } = useOrganization();
  const hex = current?.primary_color_hex || DEFAULT_ACCENT;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--org-accent', hexToHslTriplet(hex));
    root.style.setProperty('--org-accent-foreground', hexToHslTriplet(readableOn(hex)));
    return () => {
      root.style.removeProperty('--org-accent');
      root.style.removeProperty('--org-accent-foreground');
    };
  }, [hex]);

  return null;
}
