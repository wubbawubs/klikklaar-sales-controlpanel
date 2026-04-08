import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollText, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CallScriptSectionProps {
  contactName?: string | null;
  branche?: string | null;
}

export function CallScriptSection({ contactName, branche }: CallScriptSectionProps) {
  const [open, setOpen] = useState(false);
  const name = contactName || '[naam]';
  const sector = branche || '[branche / stad]';

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-border/40 bg-muted/30 hover:bg-muted/50 transition-colors text-left">
        <ScrollText className="h-4 w-4 text-primary shrink-0" />
        <span className="text-xs font-medium flex-1">Belscript</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-lg border bg-muted/20 p-4 space-y-4 text-xs leading-relaxed max-h-[50vh] overflow-y-auto">

          <ScriptStep number={1} title="Opening">
            <p className="italic text-foreground">
              "Goedemiddag <Highlight>{name}</Highlight>, je spreekt met [jouw naam] van KlikKlaar.
            </p>
            <p className="italic text-foreground">
              Ik bel je even onverwachts, dus als het niet uitkomt moet je het gewoon zeggen hoor."
            </p>
            <Branch label="Ja hoor / gaat wel">
              <p className="italic">"Top, ik zal het ook kort houden." → naar stap 2</p>
            </Branch>
            <Branch label="Nee / komt slecht uit">
              <p className="italic">"Geen probleem, wanneer zou het beter uitkomen dat ik even terugbel?"</p>
            </Branch>
          </ScriptStep>

          <ScriptStep number={2} title="Context | Waarom je belt">
            <p className="italic text-foreground">
              "De reden dat ik even bel is omdat ik af en toe websites bekijk van ondernemers in <Highlight>{sector}</Highlight>, en ik kwam jullie website tegen.
            </p>
            <p className="italic text-foreground">
              Wat mij opviel is dat er online vaak nog best wat kansen liggen om beter gevonden te worden in Google en tegenwoordig ook in AI zoekplatformen zoals ChatGPT."
            </p>
            <p className="italic text-foreground">
              "Dus ik was gewoon even benieuwd hoe jullie daar momenteel mee omgaan."
            </p>
          </ScriptStep>

          <ScriptStep number={3} title="Situatievraag | Gesprek openen">
            <p className="italic text-foreground">
              "Mag ik vragen: krijgen jullie eigenlijk al klanten via Google of komt het vooral via andere kanalen binnen?"
            </p>
            <Branch label="Via mond-tot-mond / Instagram / netwerk">
              <p className="italic">"Ja dat hoor ik eigenlijk best vaak. Veel ondernemers halen hun klanten vooral uit hun netwerk, terwijl er online vaak ook nog best wat vraag zit."</p>
            </Branch>
            <Branch label="Ja via Google">
              <p className="italic">"Dat is mooi. Doen jullie daar dan actief iets voor of loopt dat een beetje vanzelf?"</p>
            </Branch>
            <Branch label="Geen idee">
              <p className="italic">"Dat hoor ik ook regelmatig. Veel ondernemers zijn er eerlijk gezegd ook gewoon druk genoeg mee."</p>
            </Branch>
          </ScriptStep>

          <ScriptStep number={4} title="Kleine waarde geven">
            <p className="italic text-foreground">
              "Wat we vaak zien bij websites is dat er een paar kleine dingen ontbreken waardoor zoekmachines eigenlijk niet goed begrijpen waar de website over gaat.
            </p>
            <p className="italic text-foreground">
              Denk bijvoorbeeld aan dingen zoals een goede FAQ, duidelijke paginastructuur, of meta informatie die zoekmachines gebruiken."
            </p>
            <p className="italic text-foreground">
              "Dat zijn vaak vrij kleine aanpassingen, maar ze maken wel verschil voor de zichtbaarheid."
            </p>
          </ScriptStep>

          <ScriptStep number={5} title="Zachte overgang naar onze oplossing">
            <p className="italic text-foreground">
              "Daar zijn wij met KlikKlaar eigenlijk mee bezig.
            </p>
            <p className="italic text-foreground">
              We hebben software gebouwd die dat soort optimalisaties automatisch analyseert en doorvoert, zodat ondernemers daar zelf niet mee bezig hoeven te zijn."
            </p>
            <p className="italic text-foreground">
              "Maar goed, ik ken jullie situatie natuurlijk nog niet."
            </p>
          </ScriptStep>

          <ScriptStep number={6} title="Consult voorstellen">
            <p className="italic text-foreground">
              "Wat ik doe in dit soort situaties bij ondernemers is gewoon even meekijken hoe hun website er qua zichtbaarheid voor staat.
            </p>
            <p className="italic text-foreground">
              Dan zie je eigenlijk vrij snel of er kansen liggen of dat het al goed staat."
            </p>
            <p className="italic text-foreground">
              "Als je wil kan ik dat een keer rustig met je doornemen. Dat duurt meestal een minuut of 30."
            </p>
          </ScriptStep>

          <ScriptStep number={7} title="Afspraakvraag">
            <p className="italic text-foreground">
              "Zou je het interessant vinden om daar een keer samen naar te kijken?"
            </p>
            <Branch label="Ja">
              <p className="italic">"Top. Wanneer zou het voor jou beter uitkomen, ergens deze week of volgende week?"</p>
            </Branch>
          </ScriptStep>

        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ScriptStep({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h5 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center h-4.5 w-4.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0">{number}</span>
        {title}
      </h5>
      <div className="pl-6 space-y-1.5 text-muted-foreground">{children}</div>
    </div>
  );
}

function Branch({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-1.5 pl-2 border-l-2 border-primary/20 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70">Lead: {label}</p>
      {children}
    </div>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-primary not-italic">{children}</span>;
}
