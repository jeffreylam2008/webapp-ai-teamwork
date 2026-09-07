export type PluginCategory = 'sales' | 'warehouse' | 'system' | 'other';

export type PluginLocaleText = {
  en: string;
  'zh-Hant': string;
};

/**
 * Declarative plugin contribution.
 * Feature code can stay in features/*; the plugin owns enablement + menu/route gates.
 * Future project-setup will persist selections per deployment.
 */
export type AppPluginDefinition = {
  id: string;
  name: PluginLocaleText;
  description: PluginLocaleText;
  version: string;
  category: PluginCategory;
  /** Used when no saved preference exists yet. */
  defaultEnabled: boolean;
  /** Menu hrefs hidden when this plugin is off. */
  menuHrefs?: string[];
  /** Route path prefixes redirected when this plugin is off. */
  routePrefixes?: string[];
  /** Short notes for the Plugin Lab / future project setup. */
  notes?: PluginLocaleText;
};

export type PluginEnabledMap = Record<string, boolean>;
