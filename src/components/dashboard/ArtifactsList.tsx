import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Download, ChevronDown, ChevronRight } from 'lucide-react';
import type { GeneratedArtifact } from '@/types/database';

interface Props {
  artifacts: GeneratedArtifact[];
}

export function ArtifactsList({ artifacts }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const handleDownload = (a: GeneratedArtifact) => {
    let content: string;
    let mimeType: string;
    const format = a.artifact_format || 'json';

    if (format === 'json') {
      content = a.artifact_content ? JSON.stringify(a.artifact_content, null, 2) : '{}';
      mimeType = 'application/json';
    } else {
      content = a.artifact_text || '';
      mimeType = 'text/plain';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${a.artifact_name.replace(/\s+/g, '_')}_v${a.version}.${format === 'json' ? 'json' : 'txt'}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderPreview = (a: GeneratedArtifact) => {
    const format = a.artifact_format || 'json';
    if (format === 'json' && a.artifact_content) {
      return (
        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-64 whitespace-pre-wrap font-mono">
          {JSON.stringify(a.artifact_content, null, 2)}
        </pre>
      );
    }
    if (a.artifact_text) {
      return (
        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-64 whitespace-pre-wrap font-mono">
          {a.artifact_text}
        </pre>
      );
    }
    return <p className="text-xs text-muted-foreground italic">Geen preview beschikbaar</p>;
  };

  if (artifacts.length === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        Nog geen artifacts gegenereerd
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-2">
      {artifacts.map(a => {
        const isOpen = expanded[a.id] || false;
        return (
          <Card key={a.id}>
            <Collapsible open={isOpen} onOpenChange={() => toggle(a.id)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 text-left hover:text-primary transition-colors">
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div>
                        <p className="font-medium">{a.artifact_name}</p>
                        <p className="text-sm text-muted-foreground">{a.artifact_type} • v{a.version} • {a.artifact_format}</p>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <Button variant="outline" size="sm" onClick={() => handleDownload(a)}>
                    <Download className="h-4 w-4 mr-1" />Download
                  </Button>
                </div>
                <CollapsibleContent className="mt-3">
                  {renderPreview(a)}
                </CollapsibleContent>
              </CardContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
