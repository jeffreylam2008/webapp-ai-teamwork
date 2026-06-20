import { parseJsonResponse } from '@/lib/parseJsonResponse';

export type SystemBrandingData = {
  system_name?: string;
  logo?: string | null;
  shop_logo?: string | null;
};

type SystemNameApiResponse = {
  success?: boolean;
  data?: SystemBrandingData;
};

let brandingCache: SystemBrandingData | null = null;
let brandingPromise: Promise<SystemBrandingData> | null = null;

/** Public GET /api/system/name — deduped across login, layout, etc. */
export async function fetchSystemBranding(): Promise<SystemBrandingData> {
  if (brandingCache) return brandingCache;
  if (brandingPromise) return brandingPromise;

  brandingPromise = (async () => {
    const res = await fetch('/api/system/name', { cache: 'no-store' });
    if (!res.ok) return {};
    const result = await parseJsonResponse<SystemNameApiResponse>(res);
    const data = result?.success && result?.data ? result.data : {};
    brandingCache = data;
    return data;
  })()
    .catch((err) => {
      brandingCache = null;
      throw err;
    })
    .finally(() => {
      brandingPromise = null;
    });

  return brandingPromise;
}

/** Sidebar prefers shop_logo, then logo. */
export function pickSidebarLogo(data: SystemBrandingData): string | null {
  const shop = data.shop_logo;
  const main = data.logo;
  if (typeof shop === 'string' && shop.trim() !== '') return shop.trim();
  if (typeof main === 'string' && main.trim() !== '') return main.trim();
  return null;
}

/** Login page uses main logo. */
export function pickLoginLogo(data: SystemBrandingData): string | null {
  const main = data.logo;
  return typeof main === 'string' && main.trim() !== '' ? main.trim() : null;
}

export function clearSystemBrandingCache(): void {
  brandingCache = null;
  brandingPromise = null;
}
