import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppIntro } from './AppIntro'

describe('AppIntro', () => {
  afterEach(() => vi.useRealTimers())

  it('muestra la introduccion una vez y se oculta automaticamente', () => {
    vi.useFakeTimers()
    render(<AppIntro><main>Aplicacion</main></AppIntro>)

    expect(screen.getByRole('status', { name:'Iniciando Monkey Rentals' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1600))
    expect(screen.queryByRole('status', { name:'Iniciando Monkey Rentals' })).not.toBeInTheDocument()
    expect(screen.getByText('Aplicacion')).toBeInTheDocument()
  })
})
