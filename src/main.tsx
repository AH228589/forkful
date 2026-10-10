import { render } from 'preact'
import './index.css'
import { App } from './app'
import { loadDb } from './lib/foods'
import { startReminders } from './lib/reminders'
import { loadAll } from './lib/store'

render(<App />, document.getElementById('app')!)
loadAll().then(() => {
  startReminders()
  // warm the food database in the background so search is instant
  setTimeout(loadDb, 800)
})

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
