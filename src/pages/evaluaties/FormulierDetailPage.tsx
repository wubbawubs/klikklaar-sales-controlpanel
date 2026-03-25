import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, ArrowUp, ArrowDown, Copy, ExternalLink, Save, Code } from 'lucide-react';
import { toast } from 'sonner';

const QUESTION_TYPES = [
  { value: 'short_text', label: 'Korte tekst' },
  { value: 'long_text', label: 'Lange tekst' },
  { value: 'number', label: 'Nummer' },
  { value: 'date', label: 'Datum' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'scale', label: 'Schaal 1-10' },
  { value: 'yes_no', label: 'Ja/Nee' },
];

export default function FormulierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'nieuw';

  const [form, setForm] = useState({ title: '', slug: '', description: '', status: 'draft', settings_json: {} });
  const [questions, setQuestions] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [formId, setFormId] = useState<string | null>(isNew ? null : id || null);

  useEffect(() => { if (!isNew && id) loadForm(id); }, [id]);

  const loadForm = async (fid: string) => {
    const { data: f } = await (supabase as any).from('forms').select('*').eq('id', fid).single();
    if (f) { setForm({ title: f.title, slug: f.slug, description: f.description || '', status: f.status, settings_json: f.settings_json || {} }); setFormId(f.id); }
    const { data: qs } = await (supabase as any).from('form_questions').select('*').eq('form_id', fid).order('order_index');
    setQuestions(qs || []);
  };

  const generateSlug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const saveForm = async () => {
    setSaving(true);
    try {
      let fId = formId;
      if (isNew || !fId) {
        const slug = form.slug || generateSlug(form.title);
        const { data, error } = await (supabase as any).from('forms').insert({ ...form, slug }).select('id').single();
        if (error) throw error;
        fId = data.id;
        setFormId(fId);
      } else {
        const { error } = await (supabase as any).from('forms').update(form).eq('id', fId);
        if (error) throw error;
      }

      const existingIds = questions.filter(q => q.id && !q._new).map(q => q.id);
      if (fId) {
        const { data: dbQs } = await (supabase as any).from('form_questions').select('id').eq('form_id', fId);
        const toDelete = (dbQs || []).filter((q: any) => !existingIds.includes(q.id));
        for (const q of toDelete) { await (supabase as any).from('form_questions').delete().eq('id', q.id); }
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const data = { form_id: fId, question_text: q.question_text, question_type: q.question_type, options_json: q.options_json, required: q.required, order_index: i, settings_json: q.settings_json || {} };
        if (q._new) { await (supabase as any).from('form_questions').insert(data); }
        else { await (supabase as any).from('form_questions').update(data).eq('id', q.id); }
      }

      toast.success('Formulier opgeslagen');
      if (isNew && fId) navigate(`/evaluaties/formulieren/${fId}`, { replace: true });
      else if (fId) loadForm(fId);
    } catch (err: any) { toast.error(err.message || 'Fout bij opslaan'); }
    finally { setSaving(false); }
  };

  const addQuestion = () => {
    setQuestions([...questions, { _new: true, question_text: '', question_type: 'short_text', options_json: null, required: false, order_index: questions.length, settings_json: {} }]);
  };

  const updateQuestion = (idx: number, updates: any) => setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...updates } : q));
  const removeQuestion = (idx: number) => setQuestions(qs => qs.filter((_, i) => i !== idx));
  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= questions.length) return;
    const qs = [...questions]; [qs[idx], qs[newIdx]] = [qs[newIdx], qs[idx]]; setQuestions(qs);
  };

  const publicUrl = formId ? `${window.location.origin}/form/${form.slug}` : '';
  const embedCode = publicUrl ? `<iframe src="${publicUrl}" width="100%" height="700" frameborder="0"></iframe>` : '';
  const copyText = (text: string, label: string) => { navigator.clipboard.writeText(text); toast.success(`${label} gekopieerd`); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isNew ? 'Nieuw formulier' : 'Formulier bewerken'}</h1>
        <Button onClick={saveForm} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Opslaan...' : 'Opslaan'}</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Formulier instellingen</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Titel</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value, slug: form.slug || generateSlug(e.target.value) })} placeholder="Formuliertitel" /></div>
            <div><Label>Slug</Label><Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="formulier-slug" /></div>
          </div>
          <div><Label>Beschrijving</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optionele beschrijving" /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Concept</SelectItem>
                <SelectItem value="active">Actief</SelectItem>
                <SelectItem value="inactive">Inactief</SelectItem>
                <SelectItem value="archived">Gearchiveerd</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {formId && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Delen</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input value={publicUrl} readOnly className="bg-muted font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => copyText(publicUrl, 'URL')}><Copy className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={() => window.open(publicUrl, '_blank')}><ExternalLink className="h-4 w-4" /></Button>
            </div>
            <div>
              <Label className="flex items-center gap-2 mb-2"><Code className="h-4 w-4" />Embed code</Label>
              <div className="flex items-center gap-2">
                <Input value={embedCode} readOnly className="bg-muted text-xs font-mono" />
                <Button variant="outline" size="icon" onClick={() => copyText(embedCode, 'Embed code')}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Vragen ({questions.length})</CardTitle>
          <Button onClick={addQuestion} size="sm"><Plus className="mr-1 h-4 w-4" />Vraag toevoegen</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id || `new-${idx}`} className="p-4 rounded-lg border space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground mt-2 shrink-0">#{idx + 1}</span>
                <div className="flex-1 space-y-3">
                  <Input value={q.question_text} onChange={e => updateQuestion(idx, { question_text: e.target.value })} placeholder="Vraag tekst" />
                  <div className="flex flex-wrap gap-3 items-center">
                    <Select value={q.question_type} onValueChange={v => updateQuestion(idx, { question_type: v, options_json: ['dropdown', 'multi_select'].includes(v) ? { options: [] } : v === 'scale' ? { min: 1, max: 10 } : null })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>{QUESTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={q.required} onCheckedChange={v => updateQuestion(idx, { required: v })} />Verplicht
                    </label>
                  </div>
                  {['dropdown', 'multi_select'].includes(q.question_type) && (
                    <div>
                      <Label className="text-sm">Opties (één per regel)</Label>
                      <Textarea value={(q.options_json?.options || []).join('\n')} onChange={e => updateQuestion(idx, { options_json: { ...q.options_json, options: e.target.value.split('\n').filter(Boolean) } })} placeholder={"Optie 1\nOptie 2\nOptie 3"} rows={3} />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => moveQuestion(idx, -1)} disabled={idx === 0}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => moveQuestion(idx, 1)} disabled={idx === questions.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => removeQuestion(idx)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          ))}
          {questions.length === 0 && <p className="text-center text-muted-foreground py-8">Geen vragen. Klik op "Vraag toevoegen" om te beginnen.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
