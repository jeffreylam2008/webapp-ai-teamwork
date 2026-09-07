'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Spin } from 'antd';
import { isRouteAllowedByPlugins } from './registry';
import { usePlugins } from './usePlugins';

type PluginRouteGuardProps = {
  children: React.ReactNode;
  /** Where to send the user when the plugin for this route is off. */
  fallbackHref?: string;
};

/**
 * Client guard for plugin-owned routes (e.g. /sales/monthly-invoices).
 */
export default function PluginRouteGuard({
  children,
  fallbackHref = '/',
}: PluginRouteGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, enabledMap } = usePlugins();
  const allowed = ready && isRouteAllowedByPlugins(pathname, enabledMap);

  useEffect(() => {
    if (!ready) return;
    if (!isRouteAllowedByPlugins(pathname, enabledMap)) {
      router.replace(fallbackHref);
    }
  }, [ready, pathname, enabledMap, router, fallbackHref]);

  if (!ready || !allowed) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Spin />
      </div>
    );
  }

  return <>{children}</>;
}
