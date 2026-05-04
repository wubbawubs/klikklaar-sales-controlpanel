import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TrendingUp, Target, Calculator, Settings as SettingsIcon, Save, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface Targets {
  dial_to_conv: number;
  conv_to_appt: number;
  appt_to_show: number;
  show_to_deal: number; // sales call → deal won
}

interface ForecastSettings {
  avg_deal_value_eur: number;
  workdays_per_month: number;
  dials_per_se_per_day: number;
  active_se_count: number;
}

const SETTINGS_KEY = 'forecast_settings';

export default function ForecastingPage() {
  const [targets, setTargets] = useState<Targets>({
    dial_to_conv: 35,
    conv_to_appt: 25,
    appt_to_show: 90,
    show_to_deal: 75,
  });
  const [settings, setSettings] = useState<ForecastSettings>({
    avg_deal_value_eur: 2500,
    workdays_per_month: 21,
    dials_per_se_per_day: 60,
    active_se_count: 4,
  });
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Reverse forecast input
  const [targetMrr, setTargetMrr] = useState<number>(50000);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [{ data: t }, { data: s }, { data: seCount }] = await Promise.all([
      supabase.from('funnel_targets').select('funnel_type, from_stage, to_stage, target_pct').eq('scope', 'team'),
      supabase.from('settings').select('value_json').eq('key', SETTINGS_KEY).maybeSingle(),
      supabase.from('sales_executives').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]);

    if (t) {
      const map: Targets = { ...targets };
      t.forEach(row => {
        if (row.funnel_type === 'cold_call' && row.from_stage === 'dial' && row.to_stage === 'conversation') map.dial_to_conv = Number(row.target_pct);
        if (row.funnel_type === 'cold_call' && row.from_stage === 'conversation' && row.to_stage === 'appointment_booked') map.conv_to_appt = Number(row.target_pct);
        if (row.funnel_type === 'cold_call' && row.from_stage === 'appointment_booked' && row.to_stage === 'show_up') map.appt_to_show = Number(row.target_pct);
        if (row.funnel_type === 'one_call_close' && row.from_stage === 'sales_call_1' && row.to_stage === 'deal_won') map.show_to_deal = Number(row.target_pct);
      });
      setTargets(map);
    }
    if (s?.value_json) {
      setSettings(prev => ({ ...prev, ...(s.value_json as any) }));
    } else {
      const { count } = await supabase.from('sales_executives').select('id', { count: 'exact', head: true }).eq('status', 'active');
      if (count) setSettings(prev => ({ ...prev, active_se_count: count }));
    }
    setLoading(false);
  }

  async function saveSettings() {
    setSavingSettings(true);
    const { error } = await supabase.from('settings').upsert({
      key: SETTINGS_KEY,
      value_json: settings as any,
    }, { onConflict: 'key' });
    setSavingSettings(false);
    if (error) toast.error(error.message);
    else toast.success('Instellingen opgeslagen');
  }

  // ---- Math ----
  // Conversion rate per dial → deal
  const dialToDeal = useMemo(() => {
    return (targets.dial_to_conv / 100) *
           (targets.conv_to_appt / 100) *
           (targets.appt_to_show / 100) *
           (targets.show_to_deal / 100);
  }, [targets]);

  // Reverse: how many dials/appointments needed for target MRR
  const reverse = useMemo(() => {
    const dealsNeeded = settings.avg_deal_value_eur > 0 ? targetMrr / settings.avg_deal_value_eur : 0;
    const showUpsNeeded = targets.show_to_deal > 0 ? dealsNeeded / (targets.show_to_deal / 100) : 0;
    const apptsNeeded = targets.appt_to_show > 0 ? showUpsNeeded / (targets.appt_to_show / 100) : 0;
    const convsNeeded = targets.conv_to_appt > 0 ? apptsNeeded / (targets.conv_to_appt / 100) : 0;
    const dialsNeeded = targets.dial_to_conv > 0 ? convsNeeded / (targets.dial_to_conv / 100) : 0;
    const totalCapacity = settings.dials_per_se_per_day * settings.workdays_per_month * settings.active_se_count;
    const seDaysNeeded = settings.dials_per_se_per_day > 0 ? dialsNeeded / settings.dials_per_se_per_day : 0;
    return {
      dealsNeeded,
      showUpsNeeded,
      apptsNeeded,
      convsNeeded,
      dialsNeeded,
      totalCapacity,
      capacityUsedPct: totalCapacity > 0 ? (dialsNeeded / totalCapacity) * 100 : 0,
      seDaysNeeded,
    };
  }, [targetMrr, targets, settings]);

  // Forward: what does our current capacity produce?
  const forward = useMemo(() => {
    const totalDials = settings.dials_per_se_per_day * settings.workdays_per_month * settings.active_se_count;
    const convs = totalDials * (targets.dial_to_conv / 100);
    const appts = convs * (targets.conv_to_appt / 100);
    const showUps = appts * (targets.appt_to_show / 100);
    const deals = showUps * (targets.show_to_deal / 100);
    const mrr = deals * settings.avg_deal_value_eur;
    return { totalDials, convs, appts, showUps, deals, mrr };
  }, [targets, settings]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
          <TrendingUp className="h-[18px] w-[18px] text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-page text-foreground">Forecasting</h1>
          <p className="text-sm text-muted-foreground">
            Bereken backwards van MRR doelen, of forward vanuit huidige capaciteit.
          </p>
        </div>
      </div>

      <Tabs defaultValue="reverse" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reverse"><Target className="h-4 w-4 mr-1.5" />Reverse, target MRR</TabsTrigger>
          <TabsTrigger value="forward"><ArrowRight className="h-4 w-4 mr-1.5" />Forward, capaciteit</TabsTrigger>
          <TabsTrigger value="settings"><SettingsIcon className="h-4 w-4 mr-1.5" />Instellingen</TabsTrigger>
        </TabsList>

        {/* REVERSE */}
        <TabsContent value="reverse" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" /> Wat is er nodig?</CardTitle>
              <CardDescription>Vul een MRR doel in en zie hoeveel dials/afspraken nodig zijn.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="max-w-xs space-y-1.5">
                <Label>Target MRR (EUR per maand)</Label>
                <Input
                  type="number"
                  value={targetMrr}
                  onChange={(e) => setTargetMrr(Number(e.target.value) || 0)}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat label="Dials nodig" value={Math.ceil(reverse.dialsNeeded).toLocaleString('nl-NL')} accent="primary" />
                <Stat label="Gesprekken" value={Math.ceil(reverse.convsNeeded).toLocaleString('nl-NL')} />
                <Stat label="Afspraken geboekt" value={Math.ceil(reverse.apptsNeeded).toLocaleString('nl-NL')} />
                <Stat label="Show-ups" value={Math.ceil(reverse.showUpsNeeded).toLocaleString('nl-NL')} />
                <Stat label="Deals" value={Math.ceil(reverse.dealsNeeded).toLocaleString('nl-NL')} accent="emerald" />
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Huidige team capaciteit per maand</span>
                  <span className="font-semibold tabular-nums">{reverse.totalCapacity.toLocaleString('nl-NL')} dials</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Capaciteit gebruikt voor dit doel</span>
                  <span className={`font-semibold tabular-nums ${reverse.capacityUsedPct > 100 ? 'text-rose-600' : reverse.capacityUsedPct > 80 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {reverse.capacityUsedPct.toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">SE werkdagen nodig (totaal)</span>
                  <span className="font-semibold tabular-nums">{reverse.seDaysNeeded.toFixed(1)} dagen</span>
                </div>
                {reverse.capacityUsedPct > 100 && (
                  <p className="text-xs text-rose-600 pt-1">
                    ⚠ Doel overschrijdt huidige capaciteit. Verhoog SE aantal, dials/dag, of conversiepercentages.
                  </p>
                )}
              </div>

              <ConversionStrip targets={targets} dialToDeal={dialToDeal} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* FORWARD */}
        <TabsContent value="forward" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ArrowRight className="h-5 w-5 text-primary" /> Wat levert dit op?</CardTitle>
              <CardDescription>
                Op basis van {settings.active_se_count} SE × {settings.dials_per_se_per_day} dials × {settings.workdays_per_month} werkdagen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat label="Dials per maand" value={forward.totalDials.toLocaleString('nl-NL')} accent="primary" />
                <Stat label="Gesprekken" value={Math.round(forward.convs).toLocaleString('nl-NL')} />
                <Stat label="Afspraken" value={Math.round(forward.appts).toLocaleString('nl-NL')} />
                <Stat label="Show-ups" value={Math.round(forward.showUps).toLocaleString('nl-NL')} />
                <Stat label="Deals" value={Math.round(forward.deals).toLocaleString('nl-NL')} accent="emerald" />
              </div>

              <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-emerald-500/5 p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Verwachte MRR</p>
                <p className="text-3xl font-bold text-foreground mt-1 tabular-nums">
                  € {Math.round(forward.mrr).toLocaleString('nl-NL')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ARR ≈ € {Math.round(forward.mrr * 12).toLocaleString('nl-NL')}
                </p>
              </div>

              <ConversionStrip targets={targets} dialToDeal={dialToDeal} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* SETTINGS */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><SettingsIcon className="h-5 w-5 text-primary" /> Globale forecasting parameters</CardTitle>
              <CardDescription>
                Conversiepercentages worden beheerd in Instellingen → Funnel Targets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Gemiddelde deal waarde (EUR)</Label>
                  <Input
                    type="number"
                    value={settings.avg_deal_value_eur}
                    onChange={(e) => setSettings({ ...settings, avg_deal_value_eur: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Werkdagen per maand</Label>
                  <Input
                    type="number"
                    value={settings.workdays_per_month}
                    onChange={(e) => setSettings({ ...settings, workdays_per_month: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Dials per SE per dag (target)</Label>
                  <Input
                    type="number"
                    value={settings.dials_per_se_per_day}
                    onChange={(e) => setSettings({ ...settings, dials_per_se_per_day: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Aantal actieve SE's</Label>
                  <Input
                    type="number"
                    value={settings.active_se_count}
                    onChange={(e) => setSettings({ ...settings, active_se_count: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <Button onClick={saveSettings} disabled={savingSettings}>
                <Save className="h-4 w-4 mr-1.5" />
                {savingSettings ? 'Opslaan...' : 'Opslaan'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'primary' | 'emerald' }) {
  const accentClass =
    accent === 'primary' ? 'border-primary/30 bg-primary/5' :
    accent === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/5' :
    'border-border bg-card';
  return (
    <div className={`rounded-lg border p-3 ${accentClass}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function ConversionStrip({ targets, dialToDeal }: { targets: Targets; dialToDeal: number }) {
  const steps = [
    { label: 'Dial → Gesprek', pct: targets.dial_to_conv },
    { label: 'Gesprek → Afspraak', pct: targets.conv_to_appt },
    { label: 'Afspraak → Show-up', pct: targets.appt_to_show },
    { label: 'Show-up → Deal', pct: targets.show_to_deal },
  ];
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Funnel conversie targets</p>
        <p className="text-xs text-muted-foreground">
          Dial → Deal, <span className="font-semibold text-foreground tabular-nums">{(dialToDeal * 100).toFixed(2)}%</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {steps.map(s => (
          <span key={s.label} className="inline-flex items-center gap-1.5 bg-background border border-border rounded-md px-2 py-1">
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-semibold tabular-nums">{s.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
