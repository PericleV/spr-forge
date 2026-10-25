import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// (Mantine's styles first: the app's own come after them and win)
import { UiProvider } from './ui/Provider.tsx'
import './index.css'
import App from './App.tsx'
import { AppCrash, ErrorBoundary } from './ErrorBoundary.tsx'
import { installQuickTips } from './ui/quickTip.ts'

installQuickTips()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UiProvider>
      <ErrorBoundary fallback={(e) => <AppCrash error={e} />}>
        <App />
      </ErrorBoundary>
    </UiProvider>
  </StrictMode>,
)
