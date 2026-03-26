import { useState } from 'react';
import { format, subWeeks } from 'date-fns';
import { nl } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  from: Date;
  to: Date;
  onChange: (range: { from: Date; to: Date }) => void;
}

const PRESETS = [
  { label: '4 weken', weeks: 4 },
  { label: '8 weken', weeks: 8 },
  { label: '12 weken', weeks: 12 },
  { label: '26 weken', weeks: 26 },
];

export default function DashboardDateFilter({ from, to, onChange }: Props) {
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(p => {
        const presetFrom = subWeeks(new Date(), p.weeks);
        const isActive =
          Math.abs(from.getTime() - presetFrom.getTime()) < 86400000 &&
          Math.abs(to.getTime() - new Date().getTime()) < 86400000;
        return (
          <Button
            key={p.weeks}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            className="text-xs"
            onClick={() => onChange({ from: subWeeks(new Date(), p.weeks), to: new Date() })}
          >
            {p.label}
          </Button>
        );
      })}

      <div className="flex items-center gap-1 ml-2">
        <Popover open={openFrom} onOpenChange={setOpenFrom}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('text-xs gap-1')}>
              <CalendarIcon className="h-3 w-3" />
              {format(from, 'd MMM', { locale: nl })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={from}
              onSelect={(d) => { if (d) { onChange({ from: d, to }); setOpenFrom(false); } }}
              className={cn('p-3 pointer-events-auto')}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">—</span>
        <Popover open={openTo} onOpenChange={setOpenTo}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn('text-xs gap-1')}>
              <CalendarIcon className="h-3 w-3" />
              {format(to, 'd MMM', { locale: nl })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={to}
              onSelect={(d) => { if (d) { onChange({ from, to: d }); setOpenTo(false); } }}
              className={cn('p-3 pointer-events-auto')}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
