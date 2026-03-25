import { useState, useEffect, KeyboardEvent } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, Send, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormData { id: string; title: string; slug: string; description: string | null; status: string; }
interface Question { id: string; question_text: string; question_type: string; options_json: any; required: boolean; order_index: number; settings_json: any; }

export default function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [form, setForm] = useState<FormData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inactive, setInactive] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const { data: f } = await (supabase as any).from('forms').select('*').eq('slug', slug).maybeSingle();
      if (!f) { setLoading(false); return; }
      if (f.status !== 'active') { setInactive(true); setForm(f); setLoading(false); return; }
      setForm(f);
      const { data: qs } = await (supabase as any).from('form_questions').select('*').eq('form_id', f.id).order('order_index');
      setQuestions((qs || []) as Question[]);

      const saved = sessionStorage.getItem(`form-${slug}`);
      const restored = saved ? JSON.parse(saved) : {};
      const prefills: Record<string, any> = {};
      (qs || []).forEach((q: any) => {
        const param = q.settings_json?.prefill_param;
        if (param) { const v = searchParams.get(param); if (v) prefills[q.id] = v; }
        if (q.question_type === 'date' && !restored[q.id] && !prefills[q.id]) {
          prefills[q.id] = new Date().toISOString().split('T')[0];
        }
      });
      setAnswers({ ...prefills, ...restored });
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    if (slug && Object.keys(answers).length) sessionStorage.setItem(`form-${slug}`, JSON.stringify(answers));
  }, [answers, slug]);

  const currentQ = step >= 0 && step < questions.length ? questions[step] : null;
  const totalSteps = questions.length;
  const progress = step < 0 ? 0 : step >= totalSteps ? 100 : ((step + 1) / totalSteps) * 100;

  const validate = (q: Question): boolean => {
    const val = answers[q.id];
    if (q.required) {
      if (val === undefined || val === null || val === '') { setError('Dit veld is verplicht'); return false; }
      if (q.question_type === 'multi_select' && (!Array.isArray(val) || val.length === 0)) { setError('Selecteer minimaal één optie'); return false; }
    }
    if (q.question_type === 'number' && val !== '' && val !== undefined) {
      const n = Number(val);
      if (isNaN(n) || n < 0) { setError('Vul een geldig positief getal in'); return false; }
    }
    setError('');
    return true;
  };

  const next = (skipValidation = false) => {
    if (step === -1) { setStep(0); return; }
    if (!skipValidation && currentQ && !validate(currentQ)) return;
    setError('');
    setStep(s => s + 1);
  };

  const prev = () => { setError(''); setStep(s => Math.max(-1, s - 1)); };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && currentQ?.question_type !== 'long_text') {
      e.preventDefault();
      next();
    }
  };

  const setAnswer = (val: any) => setAnswers(prev => ({ ...prev, [currentQ!.id]: val }));

  const submit = async () => {
    if (!form) return;
    setSubmitting(true);
    try {
      const metadata: Record<string, string> = {};
      ['employee', 'team', 'manager', 'campaign', 'source'].forEach(p => {
        const v = searchParams.get(p); if (v) metadata[p] = v;
      });

      const submissionId = crypto.randomUUID();
      const { error: subErr } = await (supabase as any).from('form_submissions')
        .insert({ id: submissionId, form_id: form.id, metadata_json: metadata });
      if (subErr) throw subErr;

      const answerRows = questions.map(q => ({
        submission_id: submissionId,
        question_id: q.id,
        answer_text: typeof answers[q.id] === 'string' ? answers[q.id] : (answers[q.id] !== undefined ? JSON.stringify(answers[q.id]) : null),
        answer_json: typeof answers[q.id] !== 'string' && answers[q.id] !== undefined ? answers[q.id] : null,
      }));
      const { error: ansErr } = await (supabase as any).from('submission_answers').insert(answerRows);
      if (ansErr) throw ansErr;

      if (form.slug === 'end-of-day-evaluatie') {
        const qMap: Record<number, string> = {};
        questions.forEach(q => { qMap[q.order_index] = q.id; });
        const g = (idx: number) => answers[qMap[idx]];
        await (supabase as any).from('eod_submission_data').insert({
          submission_id: submissionId,
          form_id: form.id,
          employee_name: g(0) || metadata.employee || null,
          team: g(1) || metadata.team || null,
          work_date: g(2) || null,
          product_lines: Array.isArray(g(3)) ? g(3) : null,
          calls_attempted: Number(g(4)) || 0,
          real_conversations: Number(g(5)) || 0,
          appointments_set: Number(g(6)) || 0,
          followups_set: Number(g(7)) || 0,
          deals_closed: Number(g(8)) || 0,
          day_score: Number(g(9)) || null,
          energy_score: Number(g(10)) || null,
          good_things: g(11) || null,
          blocker_text: g(12) || null,
          coaching_text: g(13) || null,
          focus_tomorrow: g(14) || null,
          extra_notes: g(15) || null,
          metadata_json: metadata,
        });
      }

      sessionStorage.removeItem(`form-${slug}`);
      navigate(`/form/${slug}/success`);
    } catch (err: any) {
      console.error('Submit error:', err);
      setError('Er ging iets mis bij het versturen. Probeer het opnieuw.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderInput = (q: Question) => {
    const val = answers[q.id];
    switch (q.question_type) {
      case 'short_text':
        return <Input value={val || ''} onChange={e => setAnswer(e.target.value)} placeholder="Typ je antwoord..." className="text-lg h-14 bg-background" autoFocus />;
      case 'long_text':
        return <Textarea value={val || ''} onChange={e => setAnswer(e.target.value)} placeholder="Typ je antwoord..." className="text-lg min-h-[120px] bg-background" autoFocus />;
      case 'number':
        return <Input type="number" min={0} value={val ?? ''} onChange={e => setAnswer(e.target.value)} placeholder="0" className="text-lg h-14 w-40 bg-background" autoFocus />;
      case 'date':
        return <Input type="date" value={val || ''} onChange={e => setAnswer(e.target.value)} className="text-lg h-14 w-56 bg-background" autoFocus />;
      case 'dropdown': {
        const opts = Array.isArray(q.options_json) ? q.options_json : (q.options_json?.options || []);
        return (
          <div className="space-y-2">
            {opts.map((opt: string) => (
              <button key={opt} onClick={() => { setAnswer(opt); setTimeout(next, 200); }}
                className={cn("block w-full text-left px-4 py-3 rounded-lg border transition-all text-base",
                  val === opt ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50 bg-background"
                )}>{opt}</button>
            ))}
          </div>
        );
      }
      case 'multi_select': {
        const opts = Array.isArray(q.options_json) ? q.options_json : (q.options_json?.options || []);
        const selected = Array.isArray(val) ? val : [];
        return (
          <div className="space-y-2">
            {opts.map((opt: string) => (
              <label key={opt} className={cn("flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all",
                selected.includes(opt) ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 bg-background"
              )}>
                <Checkbox checked={selected.includes(opt)} onCheckedChange={checked => {
                  setAnswer(checked ? [...selected, opt] : selected.filter((s: string) => s !== opt));
                }} />
                <span className="text-base">{opt}</span>
              </label>
            ))}
          </div>
        );
      }
      case 'scale': {
        const min = q.options_json?.min || 1;
        const max = q.options_json?.max || 10;
        const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
        return (
          <div className="flex flex-wrap gap-2 justify-center">
            {nums.map(n => (
              <button key={n} onClick={() => { setAnswer(n); setTimeout(next, 200); }}
                className={cn("w-12 h-12 rounded-lg border text-lg font-medium transition-all",
                  val === n ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50 bg-background"
                )}>{n}</button>
            ))}
          </div>
        );
      }
      case 'yes_no':
        return (
          <div className="flex gap-3">
            {['Ja', 'Nee'].map(opt => (
              <button key={opt} onClick={() => { setAnswer(opt); setTimeout(next, 200); }}
                className={cn("flex-1 py-4 rounded-lg border text-lg font-medium transition-all",
                  val === opt ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50 bg-background"
                )}>{opt}</button>
            ))}
          </div>
        );
      default:
        return <Input value={val || ''} onChange={e => setAnswer(e.target.value)} className="text-lg h-14 bg-background" autoFocus />;
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen bg-background"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!form) return <div className="flex items-center justify-center min-h-screen bg-background"><div className="text-center p-6"><h1 className="text-2xl font-bold">Formulier niet gevonden</h1><p className="text-muted-foreground mt-2">Dit formulier bestaat niet of is verwijderd.</p></div></div>;
  if (inactive) return <div className="flex items-center justify-center min-h-screen bg-background"><div className="text-center p-6"><AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><h1 className="text-2xl font-bold">Formulier niet beschikbaar</h1><p className="text-muted-foreground mt-2">Dit formulier is momenteel niet actief.</p></div></div>;

  return (
    <div className="min-h-screen bg-background flex flex-col" onKeyDown={handleKeyDown as any}>
      <div className="fixed top-0 left-0 right-0 z-50">
        <Progress value={progress} className="h-1 rounded-none" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4 pt-8">
        <div className="w-full max-w-lg">
          {step === -1 && (
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h1 className="text-3xl font-bold">{form.title}</h1>
              {form.description && <p className="text-muted-foreground text-lg">{form.description}</p>}
              <Button onClick={next} size="lg" className="text-lg px-8">Starten <ChevronRight className="ml-2 h-5 w-5" /></Button>
            </div>
          )}

          {currentQ && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" key={currentQ.id}>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Vraag {step + 1} van {totalSteps}</p>
                <h2 className="text-xl font-semibold">{currentQ.question_text}{currentQ.required && <span className="text-destructive ml-1">*</span>}</h2>
              </div>
              {renderInput(currentQ)}
              {error && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4" />{error}</p>}
              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={prev}><ChevronLeft className="mr-1 h-4 w-4" />Vorige</Button>
                <Button onClick={next}>{step === totalSteps - 1 ? 'Controleren' : 'Volgende'} <ChevronRight className="ml-1 h-4 w-4" /></Button>
              </div>
              {currentQ.question_type !== 'long_text' && (
                <p className="text-xs text-muted-foreground text-center">Druk Enter ↵ om door te gaan</p>
              )}
            </div>
          )}

          {step === totalSteps && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-2xl font-bold">Controleer je antwoorden</h2>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                {questions.map((q, i) => (
                  <div key={q.id} className="p-3 rounded-lg border bg-card cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setStep(i)}>
                    <p className="text-sm text-muted-foreground">{q.question_text}</p>
                    <p className="font-medium mt-1">
                      {Array.isArray(answers[q.id]) ? answers[q.id].join(', ') : (answers[q.id]?.toString() || <span className="text-muted-foreground italic">Niet ingevuld</span>)}
                    </p>
                  </div>
                ))}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-between pt-4">
                <Button variant="ghost" onClick={prev}><ChevronLeft className="mr-1 h-4 w-4" />Vorige</Button>
                <Button onClick={submit} disabled={submitting} size="lg">{submitting ? 'Versturen...' : 'Versturen'} <Send className="ml-2 h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
