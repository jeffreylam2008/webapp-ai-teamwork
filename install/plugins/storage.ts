import { getDefaultPluginEnabledMap, getPluginById } from './registry';
import type { PluginEnabledMap } from './types';

/** Client preference store for Plugin Lab. Future: project-setup will write server-side. */
export const PLUGIN_ENABLED_STORAGE_KEY = '__app_plugin_enabled';
export const PLUGIN_ENABLED_CHANGED_EVENT = 'app-plugin-enabled-changed';

export function readPluginEnabledMap(): PluginEnabledMap {
  if (typeof window === 'undefined') {
    return getDefaultPluginEnabledMap();
  }
  try {
    const raw = localStorage.getItem(PLUGIN_ENABLED_STORAGE_KEY);
    if (!raw) return getDefaultPluginEnabledMap();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return getDefaultPluginEnabledMap();
    }
    const defaults = getDefaultPluginEnabledMap();
    const next: PluginEnabledMap = { ...defaults };
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!getPluginById(id)) continue;
      if (typeof value === 'boolean') next[id] = value;
    }
    return next;
  } catch {
    return getDefaultPluginEnabledMap();
  }
}

export function writePluginEnabledMap(map: PluginEnabledMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PLUGIN_ENABLED_STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(
      new CustomEvent(PLUGIN_ENABLED_CHANGED_EVENT, { detail: map })
    );
  } catch {
    // Ignore quota / private mode.
  }
}

export function setPluginEnabled(id: string, enabled: boolean): PluginEnabledMap {
  const next = { ...readPluginEnabledMap(), [id]: enabled };
  writePluginEnabledMap(next);
  return next;
}

export function isPluginEnabled(id: string, map?: PluginEnabledMap): boolean {
  const source = map ?? (typeof window !== 'undefined' ? readPluginEnabledMap() : getDefaultPluginEnabledMap());
  const plugin = getPluginById(id);
  if (!plugin) return false;
  return source[id] ?? plugin.defaultEnabled;
}
