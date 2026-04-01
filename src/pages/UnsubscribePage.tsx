import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2, MailX } from 'lucide-react';

type Status = 'loading' | 'valid' | 'already_unsubscribed' | 'invalid' | 'success' | 'error';

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    const validate = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: anonKey } }
        );
        const data = await res.json();
        if (data.valid === false && data.reason === 'already_unsubscribed') {
          setStatus('already_unsubscribed');
        } else if (data.valid) {
          setStatus('valid');
        } else {
          setStatus('invalid');
        }
      } catch {
        setStatus('invalid');
      }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const { data } = await supabase.functions.invoke('handle-email-unsubscribe', {
        body: { token },
      });
      if (data?.success) {
        setStatus('success');
      } else if (data?.reason === 'already_unsubscribed') {
        setStatus('already_unsubscribed');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">E-mail uitschrijving</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground text-sm">Laden...</p>
            </div>
          )}

          {status === 'valid' && (
            <div className="flex flex-col items-center gap-4">
              <MailX className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Wil je geen e-mails meer ontvangen? Klik hieronder om je uit te schrijven.
              </p>
              <Button onClick={handleUnsubscribe} disabled={submitting} variant="destructive">
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Uitschrijven bevestigen
              </Button>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="h-12 w-12 text-green-600" />
              <p className="text-sm text-muted-foreground">
                Je bent succesvol uitgeschreven. Je ontvangt geen e-mails meer.
              </p>
            </div>
          )}

          {status === 'already_unsubscribed' && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Je bent al uitgeschreven.
              </p>
            </div>
          )}

          {status === 'invalid' && (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="text-sm text-muted-foreground">
                Ongeldige of verlopen link. Neem contact op als je hulp nodig hebt.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="h-12 w-12 text-destructive" />
              <p className="text-sm text-muted-foreground">
                Er is iets misgegaan. Probeer het later opnieuw.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
