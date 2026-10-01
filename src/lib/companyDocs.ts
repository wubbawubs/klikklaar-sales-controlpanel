export const MAX_DOC_BYTES = 20 * 1024 * 1024;

export const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

// '{org}/{company}/{id}-{name}' — first segment is what the storage RLS checks.
export const companyDocPath = (orgId: string, companyId: string, fileName: string, id: string) =>
  `${orgId}/${companyId}/${id}-${sanitizeFileName(fileName)}`;

export function validateDoc(file: { size: number }): string | null {
  return file.size > MAX_DOC_BYTES ? 'Bestand is groter dan 20 MB' : null;
}
