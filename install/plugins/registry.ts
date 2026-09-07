import type { AppPluginDefinition } from './types';
import { monthlyInvoicesPlugin } from './monthly-invoices';

/** All installable / selectable plugins for this codebase. */
export const APP_PLUGINS: AppPluginDefinition[] = [monthlyInvoicesPlugin];

export function getPluginById(id: string): AppPluginDefinition | undefined {
  return APP_PLUGINS.find((p) => p.id === id);
}

export function getDefaultPluginEnabledMap(): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const plugin of APP_PLUGINS) {
    map[plugin.id] = plugin.defaultEnabled;
  }
  return map;
}

export function getMenuHrefsBlockedByDisabledPlugins(
  enabled: Record<string, boolean>
): Set<string> {
  const blocked = new Set<string>();
  for (const plugin of APP_PLUGINS) {
    const on = enabled[plugin.id] ?? plugin.defaultEnabled;
    if (on) continue;
    for (const href of plugin.menuHrefs ?? []) {
      blocked.add(href);
    }
  }
  return blocked;
}

export function isRouteAllowedByPlugins(
  pathname: string,
  enabled: Record<string, boolean>
): boolean {
  for (const plugin of APP_PLUGINS) {
    const on = enabled[plugin.id] ?? plugin.defaultEnabled;
    if (on) continue;
    for (const prefix of plugin.routePrefixes ?? []) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        return false;
      }
    }
  }
  return true;
}
