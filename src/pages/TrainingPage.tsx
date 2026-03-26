import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Video, FileText, Phone, HelpCircle, BookOpen, Package, FileSpreadsheet, Download, ArrowLeft, FileIcon, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const categoryConfig: Record<string, { icon: any; description: string }> = {
  "Video's": { icon: Video, description: "Trainingsvideo's en instructiefilmpjes" },
  'Coaching-documenten': { icon: FileText, description: 'Persoonlijke coaching en evaluatie' },
  'Belscripts': { icon: Phone, description: 'Scripts voor koude en warme acquisitie' },
  'FAQ': { icon: HelpCircle, description: 'Veelgestelde vragen en antwoorden' },
  'Procesinstructies': { icon: BookOpen, description: 'Stapsgewijze werkprocessen' },
  'Productinformatie': { icon: Package, description: 'KlikklaarSEO en KlikklaarWEB productdetails' },
  'Offerteformats': { icon: FileSpreadsheet, description: 'Standaard offertetemplates' },
};

function formatFileSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function TrainingPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);

  const { data: documents = [] } = useQuery({
    queryKey: ['training-documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_documents')
        .select('*')
        .order('display_name');
      if (error) throw error;
      return data;
    },
  });

  const categoryCounts = documents.reduce((acc, doc) => {
    acc[doc.category] = (acc[doc.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categories = Object.entries(categoryConfig).map(([label, config]) => ({
    label,
    ...config,
    count: categoryCounts[label] || 0,
  }));

  const filteredDocs = selectedCategory
    ? documents.filter(d => d.category === selectedCategory)
    : [];

  const getPublicUrl = (filePath: string) => {
    const { data } = supabase.storage.from('training-documents').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleDownload = (filePath: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = getPublicUrl(filePath);
    a.download = fileName;
    a.target = '_blank';
    a.click();
  };

  const handlePreview = (filePath: string, displayName: string) => {
    const publicUrl = getPublicUrl(filePath);
    const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`;
    setPreviewDoc({ name: displayName, url: viewerUrl });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {selectedCategory && (
          <Button variant="ghost" size="icon" onClick={() => setSelectedCategory(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {selectedCategory || 'Training & Coaching'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {selectedCategory
              ? categoryConfig[selectedCategory]?.description
              : 'Beheer trainingsinhoud voor Sales Executives'}
          </p>
        </div>
      </div>

      {!selectedCategory ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(cat => {
            const Icon = cat.icon;
            return (
              <Card
                key={cat.label}
                className="hover:shadow-md transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                onClick={() => setSelectedCategory(cat.label)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
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
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDocs.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <p className="text-sm">Geen documenten in deze categorie.</p>
              </CardContent>
            </Card>
          ) : (
            filteredDocs.map(doc => (
              <Card key={doc.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <FileIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{doc.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.file_name} · {formatFileSize(doc.file_size_bytes)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreview(doc.file_path, doc.display_name)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      Bekijken
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(doc.file_path, doc.file_name)}
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Download
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-base">{previewDoc?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 px-6 pb-6">
            {previewDoc && (
              <iframe
                src={previewDoc.url}
                className="w-full h-full rounded-lg border border-border"
                title={previewDoc.name}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
