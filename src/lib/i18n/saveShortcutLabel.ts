import type { AppLanguage } from './language';

/**
 * Standard label for primary Save actions in page toolbars and forms.
 * Matches BasicPageLayout: Ctrl+Enter (Windows/Linux) or ⌘+Enter (macOS).
 * UI copy uses "Ctrl+Enter" as requested for both locales.
 */
export function saveWithShortcutLabel(lang: AppLanguage): string {
  return lang === 'zh-Hant' ? '儲存 (Ctrl+Enter)' : 'Save (Ctrl+Enter)';
}
