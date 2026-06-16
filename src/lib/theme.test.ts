import { describe, expect, it, beforeEach } from 'vitest'
import { applyTheme, getSavedTheme, THEME_KEY } from './theme'

describe('theme helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
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
})
