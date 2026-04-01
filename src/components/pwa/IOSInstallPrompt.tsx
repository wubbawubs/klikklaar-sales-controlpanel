import { useState, useEffect } from 'react';
import { X, Share, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function IOSInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    const dismissed = localStorage.getItem('ios-install-dismissed');

    if (isIOS && !isStandalone && !dismissed) {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem('ios-install-dismissed', 'true');
    setShow(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-card border border-border rounded-xl p-4 shadow-lg max-w-sm mx-auto">
      <button onClick={dismiss} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <h3 className="text-sm font-semibold text-foreground mb-2">Installeer KlikKlaar</h3>
      <ol className="text-xs text-muted-foreground space-y-1.5">
        <li className="flex items-center gap-2">
          <Share className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>Tik op het <strong>Deel</strong>-icoon in Safari</span>
        </li>
        <li className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>Kies <strong>"Zet op beginscherm"</strong></span>
        </li>
      </ol>
      <Button variant="ghost" size="sm" onClick={dismiss} className="mt-2 w-full text-xs">
        Niet nu
      </Button>
    </div>
  );
}
