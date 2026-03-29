import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  GraduationCap, Lightbulb, TrendingUp, BarChart3,
  ChevronDown, ChevronUp, BookOpen, Phone, HelpCircle,
  Package, FileText, AlertCircle, Send, CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Advice {
  icon: typeof Lightbulb;
  title: string;
  text: string;
  trainingCategory?: string;
}

interface Props {
  seId: string;
  seName: string;
}

const TRAINING_TOPICS = [
  { value: 'belscripts', label: 'Belscripts & gesprekstechnieken', icon: Phone, category: 'Belscripts' },
  { value: 'productinfo', label: 'Productkennis', icon: Package, category: 'Productinformatie' },
  { value: 'coaching', label: 'Coaching & persoonlijke ontwikkeling', icon: FileText, category: 'Coaching-documenten' },
  { value: 'processen', label: 'Werkprocessen & procedures', icon: BookOpen, category: 'Procesinstructies' },
  { value: 'faq', label: 'Veelgestelde vragen', icon: HelpCircle, category: 'FAQ' },
];

export default function SETrainingAdviceCard({ seId, seName }: Props) {
  const { toast } = useToast();
  const [advice, setAdvice] = useState<Advice[]>([]);
  const [question, setQuestion] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [helpMode, setHelpMode] = useState(false);
  const [helpMessage, setHelpMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [helpSent, setHelpSent] = useState(false);
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

      const questions = [];
      if (total > 0 && notReached / total > 0.6) {
        questions.push('We zien dat meer dan 60% van je calls deze week niemand bereikt. Herken je dat?');
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
        questions.push('Op basis van je activiteiten hebben we een paar suggesties. Benieuwd?');
      }
      setQuestion(questions[0]);

      const adviceItems: Advice[] = [];

      if (total > 0 && notReached / total > 0.6) {
        adviceItems.push({
          icon: Lightbulb,
          title: 'Beltijden optimaliseren',
          text: 'Probeer tussen 9-10u en 16-17u te bellen. Deze tijdsloten hebben doorgaans de hoogste bereikbaarheid.',
          trainingCategory: 'Belscripts',
        });
      }
      if (total > 5 && appointments === 0) {
        adviceItems.push({
          icon: Lightbulb,
          title: 'Concreter afsluiten',
          text: 'Stel in elk gesprek een concreet moment voor: "Kunnen we donderdag om 14u even inplannen?"',
          trainingCategory: 'Belscripts',
        });
      }
      if (interest > 0 && appointments === 0) {
        adviceItems.push({
          icon: TrendingUp,
          title: 'Sneller doorpakken',
          text: `Je hebt ${interest}x interesse genoteerd. Probeer in hetzelfde gesprek al een afspraak in te plannen.`,
          trainingCategory: 'Coaching-documenten',
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
      adviceItems.push({
        icon: Lightbulb,
        title: 'Volgende stap klaarzetten',
        text: 'Noteer na elke call direct de volgende actie. Dat voorkomt dat leads koud worden.',
        trainingCategory: 'Procesinstructies',
      });

      setAdvice(adviceItems);
      setLoading(false);
    };
    analyze();
  }, [seId]);

  const handleSendHelp = async () => {
    setSending(true);
    try {
      // Create a signal for the admin/coach to see
      await supabase.from('signals').insert({
        sales_executive_id: seId,
        signal_type: 'help_request',
        severity: 'warning',
        title: `${seName} vraagt om hulp`,
        description: helpMessage || 'Directe hulp gevraagd via het dashboard.',
        action: 'Neem zo snel mogelijk contact op.',
        confidence: 'high',
      });

      // Send email notification via edge function
      await supabase.functions.invoke('notify-coach', {
        body: {
          seName,
          seId,
          message: helpMessage || 'Directe hulp gevraagd via het dashboard.',
        },
      });

      setHelpSent(true);
      setHelpMode(false);
      setHelpMessage('');
      toast({
        title: 'Hulpverzoek verzonden',
        description: 'Je coach wordt direct op de hoogte gebracht.',
      });
    } catch {
      toast({
        title: 'Fout',
        description: 'Kon het verzoek niet verzenden. Probeer het opnieuw.',
        variant: 'destructive',
      });
    }
    setSending(false);
  };

  if (loading) return null;

  const firstName = seName.split(' ')[0];
  const selectedTopicData = selectedTopic ? TRAINING_TOPICS.find(t => t.value === selectedTopic) : null;

  return (
    <Card className="border-dashed border-primary/20">
      <CardContent className="p-4 space-y-4">
        {/* Main question header */}
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
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40 group">
                      <Icon className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">{adv.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{adv.text}</p>
                        {adv.trainingCategory && (
                          <Link
                            to={`/training?category=${encodeURIComponent(adv.trainingCategory)}`}
                            className="inline-flex items-center gap-1 text-[11px] text-primary font-medium mt-1.5 hover:underline"
                          >
                            Bekijk trainingsmateriaal
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
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

        {/* Topic deep-dive dropdown */}
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground mb-2">Wil je je verder verdiepen in een specifiek onderwerp?</p>
          <Select onValueChange={setSelectedTopic} value={selectedTopic || undefined}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Kies een onderwerp..." />
            </SelectTrigger>
            <SelectContent>
              {TRAINING_TOPICS.map(topic => {
                const Icon = topic.icon;
                return (
                  <SelectItem key={topic.value} value={topic.value}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {topic.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {selectedTopicData && (
            <Link to={`/training?category=${encodeURIComponent(selectedTopicData.category)}`}>
              <Button variant="outline" size="sm" className="mt-2 h-8 text-xs w-full">
                <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                Bekijk {selectedTopicData.label.toLowerCase()}
                <ExternalLink className="h-3 w-3 ml-auto" />
              </Button>
            </Link>
          )}
        </div>

        {/* Urgent help button */}
        <div className="border-t border-border pt-3">
          {helpSent ? (
            <div className="flex items-center gap-2 text-success text-xs py-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>Je hulpverzoek is verzonden — je coach neemt zo snel mogelijk contact op.</span>
            </div>
          ) : !helpMode ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs w-full border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={() => setHelpMode(true)}
            >
              <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
              Directe hulp nodig, van een Senior? Stuur een signaal
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Waar heb je hulp bij nodig?</p>
              <Textarea
                placeholder="Optioneel: beschrijf kort waar je tegenaan loopt..."
                className="text-xs min-h-[60px] resize-none"
                value={helpMessage}
                onChange={e => setHelpMessage(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-8 text-xs flex-1"
                  onClick={handleSendHelp}
                  disabled={sending}
                >
                  <Send className="h-3.5 w-3.5 mr-1" />
                  {sending ? 'Verzenden...' : 'Verstuur signaal'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => { setHelpMode(false); setHelpMessage(''); }}
                >
                  Annuleren
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
