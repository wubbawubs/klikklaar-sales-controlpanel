import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/ui/status-badge';
import { AlertTriangle } from 'lucide-react';
import { PipedriveFunnel } from '@/components/integrations/PipedriveFunnel';

const providers = [
  {
    id: 'pipedrive', name: 'Pipedrive',
    description: 'Leads, deals en activiteiten spiegelen en opvolgen',
    features: ['Pipeline mapping', 'Status mapping', 'Activity mapping', 'Eigenaar mapping'],
    hasLiveComponent: true,
  },
  {
    id: 'exact', name: 'Exact',
    description: 'Klant-, abonnement- of financiële opvolging voorbereiden',
    features: ['Adapter-configuratie', 'OAuth-velden (placeholder)', 'Endpoint placeholders', 'Entiteitmapping'],
    warning: 'Live verbinding nog niet beschikbaar. Configuratie wordt voorbereid.',
  },
  {
    id: 'qapitaal', name: 'Qapitaal',
    description: 'Externe verwerkings- of opvolgintegratie',
    features: ['Provider configuratie', 'Import/export scenario', 'Handmatige opvolgstappen'],
    warning: 'Definitieve technische koppeling nog niet beschikbaar.',
  },
  {
    id: 'typeform', name: 'Typeform',
    description: 'EOD invullen, response intake en opvolging',
    features: ['EOD koppeling per SE', 'Response intake', 'Opvolging', 'Context velden'],
  },
];

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integratiecentrum</h1>
        <p className="text-muted-foreground text-sm mt-1">Beheer en configureer externe integraties</p>
      </div>

      <Tabs defaultValue="pipedrive">
        <TabsList>
          {providers.map(p => <TabsTrigger key={p.id} value={p.id}>{p.name}</TabsTrigger>)}
        </TabsList>

        {providers.map(p => (
          <TabsContent key={p.id} value={p.id}>
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{p.name}</CardTitle>
                      <CardDescription>{p.description}</CardDescription>
                    </div>
                    <StatusBadge status={p.hasLiveComponent ? 'connected' : 'not_configured'} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {p.warning && (
                    <div className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/20">
                      <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                      <p className="text-sm text-warning">{p.warning}</p>
                    </div>
                  )}
                  {!p.hasLiveComponent && (
                    <>
                      <div>
                        <h4 className="text-sm font-medium mb-2">Ondersteunde functies</h4>
                        <ul className="space-y-1">
                          {p.features.map(f => (
                            <li key={f} className="text-sm text-muted-foreground flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium mb-2">Status overzicht</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex justify-between p-2 bg-muted rounded">
                            <span className="text-muted-foreground">Status</span>
                            <StatusBadge status="not_configured" />
                          </div>
                          <div className="flex justify-between p-2 bg-muted rounded">
                            <span className="text-muted-foreground">Laatste test</span>
                            <span>—</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Configuratie wordt per workspace ingesteld via de Sales Executive detailpagina of beheerinstellingen. 
                    Credentials worden uitsluitend server-side opgeslagen.
                  </p>
                </CardContent>
              </Card>

              {/* Live Pipedrive funnel */}
              {p.id === 'pipedrive' && <PipedriveFunnel />}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
