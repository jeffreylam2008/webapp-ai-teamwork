/**
 * Install-time plugins — selectable feature packs for project customization.
 *
 * Entry UI lives under `/install/*` (not in the main application menu).
 * See `install/README.md` for page URLs.
 *
 * Monthly invoices are gated by plugin id `monthly-invoices`.
 */
export {
  APP_PLUGINS,
  getMenuHrefsBlockedByDisabledPlugins,
  getPluginById,
  getDefaultPluginEnabledMap,
  isRouteAllowedByPlugins,
} from './registry';
export {
  MONTHLY_INVOICES_PLUGIN_ID,
  monthlyInvoicesPlugin,
} from './monthly-invoices';
export {
  isPluginEnabled,
  readPluginEnabledMap,
  setPluginEnabled,
  writePluginEnabledMap,
  PLUGIN_ENABLED_STORAGE_KEY,
  PLUGIN_ENABLED_CHANGED_EVENT,
} from './storage';
export { usePlugins } from './usePlugins';
export { default as PluginRouteGuard } from './PluginRouteGuard';
export type { AppPluginDefinition, PluginCategory, PluginEnabledMap } from './types';
