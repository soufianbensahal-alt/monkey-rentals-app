import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppIntro } from './AppIntro'

describe('AppIntro', () => {
  afterEach(() => vi.useRealTimers())

  it('muestra la introduccion una vez y se oculta automaticamente', () => {
    vi.useFakeTimers()
    render(<AppIntro><main>Aplicacion</main></AppIntro>)

    expect(screen.getByRole('status', { name:'Iniciando Monkey Rentals' })).toBeInTheDocument()
    expect(document.querySelector('.app-intro-mobile-monkey')).toHaveAttribute('src','/monkey-logo.png')
    expect(document.querySelector('.app-intro-logo-stage--desktop img')).toHaveAttribute('src','/monkey-logo.png')
    expect(document.querySelector('.app-intro-mobile-stage')).toBeInTheDocument()
    expect(document.querySelectorAll('.app-intro-glyph').length).toBeGreaterThan(10)
    act(() => vi.advanceTimersByTime(2500))
    expect(screen.queryByRole('status', { name:'Iniciando Monkey Rentals' })).not.toBeInTheDocument()
    expect(screen.getByText('Aplicacion')).toBeInTheDocument()
  })
})
