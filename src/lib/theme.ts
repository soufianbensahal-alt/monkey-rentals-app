export type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'system'

export const THEME_KEY = 'monkey-rentals-theme'
export const LOGIN_THEME_KEY = 'monkey-rentals-login-theme'

export function getSavedTheme(): Theme { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' }

export function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getSavedLoginThemeMode(): ThemeMode {
  const stored = localStorage.getItem(LOGIN_THEME_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

export function saveLoginThemeMode(mode: ThemeMode) {
  localStorage.setItem(LOGIN_THEME_KEY, mode)
}

export function resolveThemeMode(mode: ThemeMode): Theme {
  return mode === 'system' ? getSystemTheme() : mode
}

export function applyTheme(theme: Theme, options?: { persist?: boolean }) {
  document.documentElement.dataset.theme = theme
  if (options?.persist !== false) localStorage.setItem(THEME_KEY, theme)
}

export function applyLoginTheme(mode: ThemeMode) {
  applyTheme(resolveThemeMode(mode), { persist: false })
}
