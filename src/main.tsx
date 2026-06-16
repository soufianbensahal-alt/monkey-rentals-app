import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { FleetProvider } from './store/FleetContext'
import './styles.css'
import { applyTheme } from './lib/theme'

applyTheme('light', { persist: false })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <FleetProvider><App /></FleetProvider>
    </BrowserRouter>
  </StrictMode>,
)
