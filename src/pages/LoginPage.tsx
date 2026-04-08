import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import klikklaarIcon from '@/assets/klikklaar-icon.jpeg';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

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
      toast.success('Wachtwoord-reset e-mail verstuurd! Controleer je inbox.');
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
        {/* Brand mark */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src={klikklaarIcon} alt="KlikKlaar" className="h-12 w-12 rounded-xl" />
          <div className="text-left">
            <div className="text-lg font-bold leading-tight">
              <span className="text-foreground">KlikKlaar</span>
              <span className="text-purple-400">SEO</span>
            </div>
            <div className="text-lg font-bold leading-tight">
              <span className="text-foreground">KlikKlaar</span>
              <span className="text-emerald-400">WEB</span>
            </div>
            <p className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">Control Center</p>
          </div>
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
              <>
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
                    {loading ? 'Laden...' : 'Inloggen'}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
