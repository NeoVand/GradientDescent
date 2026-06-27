import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

// Cache busting. The PWA service worker (registerType: 'autoUpdate') precaches
// the app shell, which otherwise means a refresh can keep serving the OLD build
// until a later visit. A new build's worker skipWaitings + claims clients, so we
// reload once it takes control — every refresh then lands on the latest version.
// The very first install has no prior controller, so it doesn't bounce; and we
// poll for updates so long-lived tabs pick up new deploys too.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return
    reloading = true
    window.location.reload()
  })
  navigator.serviceWorker.ready
    .then((reg) => {
      reg.update()
      setInterval(() => reg.update(), 60 * 1000)
    })
    .catch(() => {})
}

export default app
