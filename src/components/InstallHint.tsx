import { useState } from 'preact/hooks'
import { Icon } from './Icon'

const KEY = 'forkful-install-hint'
const ua = navigator.userAgent
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isAndroid = /Android/i.test(ua)
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true || document.referrer.startsWith('android-app://')

/** Tells phone visitors how to install Forkful, since iOS never offers an install button. */
export function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      return Number(localStorage.getItem(KEY) || 0) > Date.now()
    } catch {
      return false
    }
  })
  if (standalone || hidden || (!isIOS && !isAndroid)) return null
  const hide = () => {
    try {
      localStorage.setItem(KEY, String(Date.now() + 30 * 86400000))
    } catch {
      /* storage blocked */
    }
    setHidden(true)
  }
  return (
    <div class="card" style={{ borderColor: 'var(--accent)' }}>
      <div class="row gap" style={{ alignItems: 'flex-start' }}>
        <span class="row-i">
          <Icon name="download" />
        </span>
        <div class="grow">
          <b>Install Forkful as an app</b>
          {isIOS ? (
            <div class="small muted">
              Tap the <b>Share</b> button <Icon name="share" size={0.9} style={{ verticalAlign: '-0.15em' }} /> in Safari's toolbar, scroll down and choose <b>Add to Home Screen</b>. It then opens fullscreen from its own icon.
            </div>
          ) : (
            <div class="small muted">
              <a class="link" href="/forkful.apk">
                Download the Android app
              </a>{' '}
              or tap Chrome's menu, then <b>Install app</b>.
            </div>
          )}
        </div>
        <button class="btn ghost icon sm" aria-label="Hide" onClick={hide}>
          <Icon name="x" size={1} />
        </button>
      </div>
    </div>
  )
}
