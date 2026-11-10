import { useLayoutEffect } from 'react';
import { DEFAULT_THEME, findTheme } from './themes';

/**
 * Puts the theme on <html data-theme>, not on the game view's root: tooltips, modals and MUI
 * dialogs render through portals into document.body, outside the game view's subtree, but
 * never outside <html>, so they inherit the tokens from there. The default theme is the bare
 * :root, so it leaves no attribute. Unmounting (leaving the game) restores the default.
 *
 * Layout effect: the attribute must be in place before the first paint of a themed view.
 * @param {string} themeId a registry id (already resolved, see resolveTheme)
 */
export function useApplyTheme(themeId) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (themeId === DEFAULT_THEME) {
      root.removeAttribute('data-theme');
      return undefined;
    }
    const theme = findTheme(themeId);
    if (theme.loadFonts) theme.loadFonts().catch(() => {});
    root.setAttribute('data-theme', themeId);
    return () => root.removeAttribute('data-theme');
  }, [themeId]);
}
