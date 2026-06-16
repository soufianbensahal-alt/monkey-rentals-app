import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  applyLoginTheme,
  applyTheme,
  getSavedLoginThemeMode,
  getSavedTheme,
  getSystemTheme,
  LOGIN_THEME_KEY,
  resolveThemeMode,
  saveLoginThemeMode,
  THEME_KEY,
} from './theme'

function mockSystemTheme(isDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: isDark,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('theme helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    mockSystemTheme(false)
  })

  it('puede aplicar un tema sin sobrescribir la preferencia guardada', () => {
    localStorage.setItem(THEME_KEY, 'dark')

    applyTheme('light', { persist: false })

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(getSavedTheme()).toBe('dark')
  })

  it('persiste el tema cuando no se desactiva el guardado', () => {
    applyTheme('dark')

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('usa sistema como preferencia inicial del login', () => {
    expect(getSavedLoginThemeMode()).toBe('system')
  })

  it('resuelve el tema del sistema desde prefers-color-scheme', () => {
    mockSystemTheme(true)

    expect(getSystemTheme()).toBe('dark')
    expect(resolveThemeMode('system')).toBe('dark')
  })

  it('aplica el tema del login sin sobrescribir el tema autenticado', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    saveLoginThemeMode('light')

    applyLoginTheme(getSavedLoginThemeMode())

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(getSavedTheme()).toBe('dark')
    expect(localStorage.getItem(LOGIN_THEME_KEY)).toBe('light')
  })

  it('mantiene el modo sistema del login al recargar', () => {
    mockSystemTheme(true)

    saveLoginThemeMode('system')
    applyLoginTheme(getSavedLoginThemeMode())

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(LOGIN_THEME_KEY)).toBe('system')
  })
})
