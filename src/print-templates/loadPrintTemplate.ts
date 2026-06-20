import { DEFAULT_PRINT_TEMPLATE_ID } from './printTemplateRegistry';

const templateCache = new Map<string, Promise<string>>();

export { DEFAULT_PRINT_TEMPLATE_ID };

export function getPrintTemplateUrl(templateId: string): string {
  return `/api/print-templates/${encodeURIComponent(templateId)}`;
}

/** Fetch HTML print template by id (cached in memory). */
export async function loadPrintTemplate(templateId: string): Promise<string> {
  const id = templateId.trim() || DEFAULT_PRINT_TEMPLATE_ID;
  const cached = templateCache.get(id);
  if (cached) return cached;

  const request = fetch(getPrintTemplateUrl(id), { cache: 'no-store' }).then(async (res) => {
    if (!res.ok) {
      throw new Error(`Failed to load print template "${id}"`);
    }
    return res.text();
  });

  templateCache.set(id, request);
  return request;
}

export function clearPrintTemplateCache(templateId?: string): void {
  if (templateId) {
    templateCache.delete(templateId);
    return;
  }
  templateCache.clear();
}
