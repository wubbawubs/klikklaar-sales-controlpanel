import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Video, FileText, Phone, HelpCircle, BookOpen, Package, FileSpreadsheet } from 'lucide-react';

const categories = [
  { icon: Video, label: "Video's", description: 'Trainingsvideo\'s en instructiefilmpjes', count: 0 },
  { icon: FileText, label: 'Coaching-documenten', description: 'Persoonlijke coaching en evaluatie', count: 0 },
  { icon: Phone, label: 'Belscripts', description: 'Scripts voor koude en warme acquisitie', count: 0 },
  { icon: HelpCircle, label: 'FAQ', description: 'Veelgestelde vragen en antwoorden', count: 0 },
  { icon: BookOpen, label: 'Procesinstructies', description: 'Stapsgewijze werkprocessen', count: 0 },
  { icon: Package, label: 'Productinformatie', description: 'KlikklaarSEO en KlikklaarWEB productdetails', count: 0 },
  { icon: FileSpreadsheet, label: 'Offerteformats', description: 'Standaard offertetemplates', count: 0 },
];

export default function TrainingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Training & Coaching</h1>
        <p className="text-muted-foreground text-sm mt-1">Beheer trainingsinhoud voor Sales Executives</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(cat => (
          <Card key={cat.label} className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <cat.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{cat.label}</CardTitle>
                  <CardDescription className="text-xs">{cat.count} items</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{cat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <p className="text-sm">Trainingsinhoud wordt beheerd via de SharePoint trainingsbibliotheek per Sales Executive workspace.</p>
          <p className="text-xs mt-2">Upload en categoriseer content via het integratiecentrum of rechtstreeks in SharePoint.</p>
        </CardContent>
      </Card>
    </div>
  );
}
