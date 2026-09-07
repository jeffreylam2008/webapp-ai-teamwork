'use client';

import { useCallback, useEffect, useState } from 'react';
import { APP_PLUGINS } from './registry';
import {
  PLUGIN_ENABLED_CHANGED_EVENT,
  isPluginEnabled,
  readPluginEnabledMap,
  setPluginEnabled,
  writePluginEnabledMap,
} from './storage';
import type { AppPluginDefinition, PluginEnabledMap } from './types';

export function usePlugins() {
  const [enabledMap, setEnabledMap] = useState<PluginEnabledMap>(() =>
    typeof window !== 'undefined' ? readPluginEnabledMap() : {}
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEnabledMap(readPluginEnabledMap());
    setReady(true);
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<PluginEnabledMap>).detail;
      if (detail && typeof detail === 'object') {
        setEnabledMap({ ...detail });
      } else {
        setEnabledMap(readPluginEnabledMap());
      }
    };
    window.addEventListener(PLUGIN_ENABLED_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PLUGIN_ENABLED_CHANGED_EVENT, onChanged);
  }, []);

  const enabled = useCallback(
    (id: string) => isPluginEnabled(id, enabledMap),
    [enabledMap]
  );

  const setEnabled = useCallback((id: string, value: boolean) => {
    const next = setPluginEnabled(id, value);
    setEnabledMap(next);
    return next;
  }, []);

  const resetDefaults = useCallback(() => {
    const defaults: PluginEnabledMap = {};
    for (const plugin of APP_PLUGINS) {
      defaults[plugin.id] = plugin.defaultEnabled;
    }
    writePluginEnabledMap(defaults);
    setEnabledMap(defaults);
    return defaults;
  }, []);

  return {
    ready,
    plugins: APP_PLUGINS as readonly AppPluginDefinition[],
    enabledMap,
    enabled,
    setEnabled,
    resetDefaults,
  };
}
