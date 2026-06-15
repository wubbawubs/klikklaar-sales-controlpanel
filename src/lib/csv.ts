// Minimal RFC-4180-ish CSV parser. Handles quoted fields, escaped quotes ("")
// and commas/newlines inside quotes. Good enough for Pipedrive exports.
export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      record.push(field); field = '';
    } else if (c === '\n') {
      record.push(field); field = '';
      records.push(record); record = [];
    } else if (c === '\r') {
      // swallow; \n handles the break
    } else {
      field += c;
    }
  }
  // last field / record
  if (field.length > 0 || record.length > 0) { record.push(field); records.push(record); }

  const nonEmpty = records.filter(r => r.some(c => c.trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0]!.map(h => h.trim());
  const rows = nonEmpty.slice(1).map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
  return { headers, rows };
}
