import { parseJsonResponse } from '@/lib/parseJsonResponse';

export type SystemBrandingData = {
  system_name?: string;
  logo?: string | null;
  shop_logo?: string | null;
};

/** Default react-icons / Ant icon name used when none is configured. */
export const DEFAULT_SYSTEM_LOGO = 'BsShopWindow';

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

/** App logo: main logo, then shop logo, then default icon name. */
export function pickSystemLogo(data: SystemBrandingData): string {
  const main = data.logo;
  if (typeof main === 'string' && main.trim() !== '') return main.trim();
  const shop = data.shop_logo;
  if (typeof shop === 'string' && shop.trim() !== '') return shop.trim();
  return DEFAULT_SYSTEM_LOGO;
}

/** Sidebar prefers shop_logo, then logo, then default. */
export function pickSidebarLogo(data: SystemBrandingData): string {
  return pickSystemLogo(data);
}

/** Login page logo helper (same resolution as pickSystemLogo). */
export function pickLoginLogo(data: SystemBrandingData): string {
  return pickSystemLogo(data);
}

export function clearSystemBrandingCache(): void {
  brandingCache = null;
  brandingPromise = null;
}
