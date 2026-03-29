import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GraduationCap, Lightbulb, TrendingUp, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Advice {
  icon: typeof Lightbulb;
  title: string;
  text: string;
}

interface Props {
  seId: string;
  seName: string;
}

export default function SETrainingAdviceCard({ seId, seName }: Props) {
  const [advice, setAdvice] = useState<Advice[]>([]);
  const [question, setQuestion] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const analyze = async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: weekCalls } = await supabase
        .from('calls')
        .select('id, outcome, created_at')
        .eq('sales_executive_id', seId)
        .gte('created_at', weekAgo);

      const calls = weekCalls || [];
      const total = calls.length;
      const notReached = calls.filter(c => c.outcome === 'not_reached').length;
      const interest = calls.filter(c => c.outcome === 'interest').length;
      const appointments = calls.filter(c => c.outcome === 'appointment').length;
      const deals = calls.filter(c => c.outcome === 'deal').length;
      const convRate = total > 0 ? Math.round(((interest + appointments + deals) / total) * 100) : 0;

      // Dynamic question based on stats
      const questions = [];
      if (total > 0 && notReached / total > 0.6) {
        questions.push(`We zien dat meer dan 60% van je calls deze week niemand bereikt. Herken je dat?`);
      }
      if (total > 5 && appointments === 0) {
        questions.push(`Je hebt deze week ${total} calls gemaakt maar nog geen afspraak ingepland. Klopt dat met je gevoel?`);
      }
      if (interest > 0 && appointments === 0) {
        questions.push(`Er zijn ${interest} gesprekken met interesse genoteerd, maar geen afspraken. Wil je tips voor het afsluiten?`);
      }
      if (convRate >= 30) {
        questions.push(`Je conversieratio is ${convRate}% — sterker dan gemiddeld. Wil je weten hoe je dit kunt vasthouden?`);
      }
      if (questions.length === 0) {
        questions.push(`Op basis van je activiteiten hebben we een paar suggesties. Benieuwd?`);
      }

      setQuestion(questions[0]);

      // Build advice items
      const adviceItems: Advice[] = [];

      if (total > 0 && notReached / total > 0.6) {
        adviceItems.push({
          icon: Lightbulb,
          title: 'Beltijden optimaliseren',
          text: 'Probeer tussen 9-10u en 16-17u te bellen. Deze tijdsloten hebben doorgaans de hoogste bereikbaarheid.',
        });
      }
      if (total > 5 && appointments === 0) {
        adviceItems.push({
          icon: Lightbulb,
          title: 'Concreter afsluiten',
          text: 'Stel in elk gesprek een concreet moment voor: "Kunnen we donderdag om 14u even inplannen?" Dat werkt beter dan een open vraag.',
        });
      }
      if (interest > 0 && appointments === 0) {
        adviceItems.push({
          icon: TrendingUp,
          title: 'Sneller doorpakken',
          text: `Je hebt ${interest}x interesse genoteerd. Probeer in hetzelfde gesprek al een afspraak in te plannen — de kans daalt na 48 uur.`,
        });
      }
      if (total === 0) {
        adviceItems.push({
          icon: BarChart3,
          title: 'Start je eerste belsessie',
          text: 'Na een paar calls kunnen we patronen herkennen en je gerichte tips geven.',
        });
      }
      if (convRate >= 30) {
        adviceItems.push({
          icon: TrendingUp,
          title: 'Sterke prestatie',
          text: `${convRate}% conversie — focus nu op volume om het totaal te verhogen bij gelijkblijvende kwaliteit.`,
        });
      }

      // Always add a generic one
      adviceItems.push({
        icon: Lightbulb,
        title: 'Volgende stap klaarzetten',
        text: 'Noteer na elke call direct de volgende actie. Dat voorkomt dat leads koud worden.',
      });

      setAdvice(adviceItems);
      setLoading(false);
    };
    analyze();
  }, [seId]);

  if (loading) return null;

  const firstName = seName.split(' ')[0];

  return (
    <Card className="border-dashed border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{question}</p>
            
            {!expanded ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-8 text-xs border-primary/30 text-primary hover:bg-primary/5"
                onClick={() => setExpanded(true)}
              >
                Ja, laat zien
                <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <div className="mt-3 space-y-2">
                {advice.map((adv, i) => {
                  const Icon = adv.icon;
                  return (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40">
                      <Icon className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground">{adv.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{adv.text}</p>
                      </div>
                    </div>
                  );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-muted-foreground"
                  onClick={() => setExpanded(false)}
                >
                  Verbergen
                  <ChevronUp className="h-3 w-3 ml-1" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
