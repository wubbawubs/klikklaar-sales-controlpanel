// Minimal RFC 5545 export for one appointment — Outlook/Google open it with one click.
export interface IcsEvent {
  uid: string; title: string; start: Date; durationMin: number;
  description?: string | null; location?: string | null;
  organizerEmail?: string | null; attendeeEmail?: string | null; attendeeName?: string | null;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function buildIcs(e: IcsEvent): string {
  const end = new Date(e.start.getTime() + e.durationMin * 60_000);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KlikKlaar CRM//NL', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@sales.klikklaarseo.nl`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${esc(e.title)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.organizerEmail) lines.push(`ORGANIZER:mailto:${e.organizerEmail}`);
  if (e.attendeeEmail) lines.push(`ATTENDEE;CN=${esc(e.attendeeName || e.attendeeEmail)};RSVP=TRUE:mailto:${e.attendeeEmail}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(e: IcsEvent): void {
  const blob = new Blob([buildIcs(e)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${e.title.replace(/[^\w\- ]+/g, '').trim() || 'afspraak'}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
