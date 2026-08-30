import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// PWA support is currently disabled. Remove scanner service workers and caches
// left behind by earlier builds so they cannot serve stale application files.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(
        registrations
          .filter((registration) => {
            const scriptUrl = registration.active?.scriptURL ?? registration.waiting?.scriptURL
            return scriptUrl ? new URL(scriptUrl).pathname.endsWith('/sw.js') : false
          })
          .map((registration) => registration.unregister()),
      ),
    )

    if ('caches' in window) {
      void caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('number-scanner-'))
            .map((key) => caches.delete(key)),
        ),
      )
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
