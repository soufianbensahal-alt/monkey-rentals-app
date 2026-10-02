import { useEffect, useState, type ReactNode } from 'react'
import { MonkeyLogoIntro } from './intro/MonkeyLogoIntro'

const INTRO_DURATION = 2500
const REDUCED_MOTION_DURATION = 100

export function AppIntro({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timeout = window.setTimeout(() => setVisible(false), reducedMotion ? REDUCED_MOTION_DURATION : INTRO_DURATION)

    return () => window.clearTimeout(timeout)
  }, [])

  return <>
    {children}
    {visible && <section className="app-intro" role="status" aria-label="Iniciando Monkey Rentals">
      <MonkeyLogoIntro/>
    </section>}
  </>
}
