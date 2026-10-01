import { describe, it, expect } from 'vitest';
import { buildIcs } from './ics';

const base = {
  uid: 'abc-123',
  title: 'Call met Jan',
  start: new Date(Date.UTC(2026, 9, 2, 8, 0)), // 2026-10-02 08:00Z
  durationMin: 30,
};

describe('buildIcs', () => {
  it('produces a VEVENT with UTC start/end', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:abc-123@sales.klikklaarseo.nl');
    expect(ics).toContain('DTSTART:20261002T080000Z');
    expect(ics).toContain('DTEND:20261002T083000Z');
    expect(ics).toContain('SUMMARY:Call met Jan');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics.split('\r\n').length).toBeGreaterThan(5); // CRLF line endings
  });

  it('escapes commas, semicolons, backslashes and newlines', () => {
    const ics = buildIcs({ ...base, title: 'Acme, B.V.; intake', description: 'regel 1\nregel 2 \\ x' });
    expect(ics).toContain('SUMMARY:Acme\\, B.V.\\; intake');
    expect(ics).toContain('DESCRIPTION:regel 1\\nregel 2 \\\\ x');
  });

  it('adds attendee and organizer only when given', () => {
    expect(buildIcs(base)).not.toContain('ATTENDEE');
    const ics = buildIcs({ ...base, attendeeEmail: 'jan@acme.nl', attendeeName: 'Jan', organizerEmail: 'jul@otr.nl', location: 'Teams' });
    expect(ics).toContain('ATTENDEE;CN="Jan";RSVP=TRUE:mailto:jan@acme.nl');
    expect(ics).toContain('ORGANIZER:mailto:jul@otr.nl');
    expect(ics).toContain('LOCATION:Teams');
  });

  it('quotes the attendee CN so commas survive', () => {
    const ics = buildIcs({ ...base, attendeeEmail: 'p@acme.nl', attendeeName: 'Jansen, Piet' });
    expect(ics).toContain('ATTENDEE;CN="Jansen, Piet";RSVP=TRUE:mailto:p@acme.nl');
  });

  it('strips CR/LF from emails and ends with CRLF', () => {
    const ics = buildIcs({ ...base, organizerEmail: 'a@b.nl\r\nX-EVIL:1', attendeeEmail: 'c@d.nl\nBAD:1' });
    expect(ics).toContain('ORGANIZER:mailto:a@b.nlX-EVIL:1');
    expect(ics).not.toMatch(/\r\nX-EVIL/);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
