import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from './Icon'
import { Sheet } from './ui'

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code']

export async function makeDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: { new (o: unknown): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats()
      if (supported.includes('ean_13')) return new Native({ formats: FORMATS.filter((f) => supported.includes(f)) })
    } catch {
      /* fall through to the wasm reader */
    }
  }
  const [{ BarcodeDetector, prepareZXingModule }, wasm] = await Promise.all([import('barcode-detector/ponyfill'), import('zxing-wasm/reader/zxing_reader.wasm?url')])
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasm.default : prefix + path) } })
  return new BarcodeDetector({ formats: FORMATS as never })
}

export function ScannerSheet({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState('')
  const [torch, setTorch] = useState<MediaStreamTrack | null>(null)
  const [torchOn, setTorchOn] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let stop = false
    let raf = 0
    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('This browser cannot open the camera. Type the barcode number below instead.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      } catch (e) {
        setErr((e as Error).name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this app in your browser settings, or type the barcode below.' : 'No camera found. Type the barcode number below.')
        return
      }
      if (stop) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const v = video.current!
      v.srcObject = stream
      await v.play().catch(() => {})
      const track = stream.getVideoTracks()[0]
      const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean }
      if (caps.torch) setTorch(track)
      let det: Detector
      try {
        det = await makeDetector()
      } catch {
        setErr('The barcode reader failed to load. Type the number below instead.')
        return
      }
      let last = 0
      const loop = async (t: number) => {
        if (stop) return
        if (t - last > 180 && v.readyState >= 2) {
          last = t
          try {
            const found = await det.detect(v)
            const code = found.find((f) => /^\d{6,14}$/.test(f.rawValue))?.rawValue
            if (code && !stop) {
              stop = true
              navigator.vibrate?.(60)
              onCode(code)
              return
            }
          } catch {
            /* frame not ready */
          }
        }
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    })()
    return () => {
      stop = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <Sheet title="Scan a barcode" onClose={onClose}>
      {!err ? (
        <div class="scanner">
          <video ref={video} playsInline muted />
          <div class="frame" />
          <div class="laser" />
          {torch && (
            <button
              class="btn sm"
              style={{ position: 'absolute', right: '0.75rem', top: '0.75rem' }}
              onClick={async () => {
                const next = !torchOn
                await torch.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }).catch(() => {})
                setTorchOn(next)
              }}
            >
              <Icon name="zap" size={1} /> {torchOn ? 'Light off' : 'Light'}
            </button>
          )}
        </div>
      ) : (
        <div class="card center-t small">{err}</div>
      )}
      <p class="small muted center-t">Hold the barcode inside the box. It scans by itself.</p>
      <form
        class="row gap-s mt"
        onSubmit={(e) => {
          e.preventDefault()
          if (manual.replace(/\D/g, '').length >= 6) onCode(manual.replace(/\D/g, ''))
        }}
      >
        <input class="input" inputMode="numeric" placeholder="Or type the barcode number" value={manual} onInput={(e) => setManual((e.currentTarget as HTMLInputElement).value)} />
        <button class="btn primary" type="submit">
          Look up
        </button>
      </form>
    </Sheet>
  )
}
