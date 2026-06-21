import { useEffect, useState, type ReactNode } from 'react'

const INTRO_DURATION = 1600
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
      <div className="app-intro-logo-wrap">
        <img src="/monkey-rentals-logo.png" alt="" className="app-intro-logo" />
      </div>
    </section>}
  </>
}
