import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { PipedriveFunnel } from '@/components/integrations/PipedriveFunnel';
import SalesExecutiveCRM from '@/components/pipedrive/SalesExecutiveCRM';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function PipedrivePage() {
  const { user } = useAuth();
  const [seId, setSeId] = useState<string | null>(null);
  const [seName, setSeName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isEmployee, setIsEmployee] = useState(false);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const normalizedEmail = (user.email ?? '').trim().toLowerCase();
      const { data } = await supabase
        .from('sales_executives')
        .select('id, full_name, first_name, last_name, employment_type')
        .or(`email.ilike.${normalizedEmail},user_id.eq.${user.id}`)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data) {
        setSeId(data.id);
        setSeName(data.full_name || `${data.first_name} ${data.last_name}`);
        setIsEmployee((data as any).employment_type === 'employee');
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!seId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>Geen SE-profiel gekoppeld aan je account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-primary/10 p-6">
        <div>
          <h1 className="text-page text-foreground">Pipedrive</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Jouw volledige CRM-overzicht — deals, contacten en activiteiten
          </p>
        </div>
      </div>

      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline">Deal Pipeline</TabsTrigger>
          <TabsTrigger value="crm">Mijn CRM</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline">
          <PipedriveFunnel />
        </TabsContent>

        <TabsContent value="crm">
          <SalesExecutiveCRM salesExecutiveId={seId} salesExecutiveName={seName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
