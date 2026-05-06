import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import klikklaarIcon from '@/assets/klikklaar-icon.jpeg';
import otrIcon from '@/assets/org-otr-icon.webp';
import oneideaIcon from '@/assets/org-oneidea-icon.png';
import { cn } from '@/lib/utils';

type BrandKey = 'klikklaar' | 'otr' | 'oneidea';

interface BrandDef {
  key: BrandKey;
  name: string;
  subdomain: string;
  icon: string;
  accent: string; // tailwind class
  rootDomain: string; // production domain incl. subdomain prefix host
}

const BRANDS: BrandDef[] = [
  { key: 'klikklaar', name: 'KlikKlaar', subdomain: 'sales', icon: klikklaarIcon, accent: 'ring-emerald-500', rootDomain: 'sales.klikklaarseo.nl' },
  { key: 'otr', name: 'One-Time Recruit', subdomain: 'otr', icon: otrIcon, accent: 'ring-blue-500', rootDomain: 'otr.sales.klikklaarseo.nl' },
  { key: 'oneidea', name: 'One-IDEA', subdomain: 'oneidea', icon: oneideaIcon, accent: 'ring-violet-500', rootDomain: 'oneidea.sales.klikklaarseo.nl' },
];

function detectBrandFromHost(): BrandKey {
  if (typeof window === 'undefined') return 'klikklaar';
  const host = window.location.hostname;
  if (host.startsWith('otr.')) return 'otr';
  if (host.startsWith('oneidea.')) return 'oneidea';
  return 'klikklaar';
}

function isProductionHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h.endsWith('klikklaarseo.nl');
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<BrandKey>(detectBrandFromHost());

  // Sync brand → CSS theme variables (lightweight; full org theming happens after login)
  useEffect(() => {
    const map: Record<BrandKey, string> = {
      klikklaar: '#0F9B7A',
      otr: '#1E3A8A',
      oneidea: '#7C3AED',
    };
    document.documentElement.style.setProperty('--brand-primary', map[selectedBrand]);
  }, [selectedBrand]);

  const activeBrand = useMemo(
    () => BRANDS.find(b => b.key === selectedBrand) ?? BRANDS[0],
    [selectedBrand]
  );

  const handleBrandSwitch = (brand: BrandDef) => {
    setSelectedBrand(brand.key);
    // On production, navigate to the correct subdomain so the login posts under the right host
    if (isProductionHost() && !window.location.hostname.startsWith(brand.subdomain + '.')) {
      window.location.href = `https://${brand.rootDomain}/`;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      toast.success('Succesvol ingelogd');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Er is een fout opgetreden';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Vul je e-mailadres in');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('Wachtwoord-reset e-mail verstuurd, controleer je inbox.');
      setShowForgotPassword(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Er is een fout opgetreden';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Brand selector */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {BRANDS.map(b => {
            const active = b.key === selectedBrand;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => handleBrandSwitch(b)}
                className={cn(
                  'group flex flex-col items-center gap-1.5 transition-all',
                  active ? 'opacity-100 scale-100' : 'opacity-50 hover:opacity-80 scale-95'
                )}
                aria-label={`Selecteer ${b.name}`}
              >
                <div
                  className={cn(
                    'h-14 w-14 rounded-2xl overflow-hidden bg-card border border-border/60 flex items-center justify-center transition-all',
                    active && `ring-2 ring-offset-2 ring-offset-background ${b.accent} shadow-md`
                  )}
                >
                  <img src={b.icon} alt={b.name} className="h-full w-full object-cover" />
                </div>
                <span className={cn('text-[11px] font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
                  {b.name}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-center mb-6">
          <p className="text-[10px] text-muted-foreground tracking-widest uppercase">Control Center</p>
          <p className="text-sm text-muted-foreground mt-1">
            Ingelogd op <span className="font-semibold text-foreground">{activeBrand.name}</span>
          </p>
        </div>

        <Card className="shadow-elevated border-border/60">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-lg font-semibold">
              {showForgotPassword ? 'Wachtwoord vergeten' : 'Inloggen'}
            </CardTitle>
            <CardDescription>
              {showForgotPassword
                ? 'Voer je e-mailadres in om een reset-link te ontvangen'
                : 'Log in met je e-mailadres'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showForgotPassword ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mailadres</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jan@klikklaar.nl"
                    required
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? 'Laden...' : 'Reset-link versturen'}
                </Button>
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    Terug naar inloggen
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mailadres</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jan@klikklaar.nl"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Wachtwoord</Label>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                      Vergeten?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? 'Laden...' : `Inloggen bij ${activeBrand.name}`}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
