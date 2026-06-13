export type Theme = 'light' | 'dark'
export const THEME_KEY = 'monkey-rentals-theme'
export function getSavedTheme(): Theme { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' }
export function applyTheme(theme: Theme) { document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme) }
