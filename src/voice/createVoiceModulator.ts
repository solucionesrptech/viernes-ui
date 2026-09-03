export type VoiceModulatorFrame = {
  active: boolean
  audioEnergy: number
  waveformData?: Uint8Array
}

export type VoiceModulatorHandle = {
  root: SVGGElement
  update: (frame: VoiceModulatorFrame) => void
  dispose: () => void
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const CX = 400
const CY = 400
/** Diámetro de la cámara central ~260 (r≈130) → waveform ~70% ancho */
const WAVE_WIDTH = 180
const WAVE_MAX_HEIGHT = 48
const BAR_COUNT = 56

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value))
  }
  return node
}

/**
 * Modulador horizontal centrado. Sin anillos, sin barras radiales, sin texto.
 */
export function createVoiceModulator(parent: SVGElement): VoiceModulatorHandle {
  const root = el('g', { class: 'vc-modulator' })

  const glowPath = el('path', {
    class: 'vc-modulator__glow',
    fill: 'none',
  })
  const linePath = el('path', {
    class: 'vc-modulator__line',
    fill: 'none',
  })
  root.append(glowPath, linePath)

  const barsGroup = el('g', { class: 'vc-modulator__bars' })
  const bars: SVGLineElement[] = []
  const left = CX - WAVE_WIDTH / 2
  const gap = WAVE_WIDTH / (BAR_COUNT - 1)

  for (let i = 0; i < BAR_COUNT; i += 1) {
    const x = left + i * gap
    const bar = el('line', {
      class: 'vc-modulator__bar',
      x1: x,
      y1: CY,
      x2: x,
      y2: CY,
    })
    bars.push(bar)
    barsGroup.appendChild(bar)
  }
  root.appendChild(barsGroup)
  parent.appendChild(root)

  let disposed = false
  let raf = 0
  let lastFrame: VoiceModulatorFrame = { active: false, audioEnergy: 0 }
  let timeMs = 0

  const sampleWave = (data: Uint8Array | undefined, index: number, fallback: number) => {
    if (!data || data.length === 0) {
      return fallback
    }
    const i = Math.min(data.length - 1, Math.floor((index / (BAR_COUNT - 1)) * (data.length - 1)))
    return Math.abs(data[i]! / 255 - 0.5) * 2
  }

  const envelope = (i: number, t: number, energy: number, active: boolean) => {
    const xNorm = i / (BAR_COUNT - 1)
    const centerWeight = 1 - Math.abs(xNorm - 0.5) * 0.55

    if (!active) {
      return (0.04 + Math.sin(t * 1.6 + i * 0.12) * 0.025) * centerWeight
    }

    const syllable =
      0.45 * Math.abs(Math.sin(t * 5.2 + i * 0.08)) +
      0.3 * Math.abs(Math.sin(t * 2.4 + i * 0.19)) +
      0.15 * Math.abs(Math.sin(t * 9.1 + xNorm * 6))
    const pause = 0.55 + 0.45 * Math.max(0, Math.sin(t * 1.35))
    return Math.min(1, (0.12 + energy * 0.95 * syllable * pause) * centerWeight)
  }

  const paint = (frame: VoiceModulatorFrame, now: number) => {
    if (disposed) {
      return
    }

    const t = now * 0.001
    const energy = Math.min(1, Math.max(0, frame.audioEnergy))
    const active = frame.active
    root.dataset.active = active ? 'true' : 'false'

    const points: Array<{ x: number; y: number }> = []

    for (let i = 0; i < BAR_COUNT; i += 1) {
      const x = left + i * gap
      const fromData = sampleWave(frame.waveformData, i, 0)
      const env = envelope(i, t, energy, active)
      const amp = active
        ? Math.min(1, env * 0.65 + fromData * energy * 0.55)
        : env
      const h = amp * WAVE_MAX_HEIGHT
      const y1 = CY - h
      const y2 = CY + h * 0.35

      const bar = bars[i]!
      bar.setAttribute('y1', String(y1))
      bar.setAttribute('y2', String(y2))
      bar.setAttribute('opacity', String(0.2 + amp * 0.75))

      points.push({ x, y: y1 })
    }

    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ')
    linePath.setAttribute('d', d)
    glowPath.setAttribute('d', d)
    linePath.setAttribute('opacity', String(0.35 + energy * 0.5))
    glowPath.setAttribute('opacity', String(0.15 + energy * 0.35))
  }

  const loop = (now: number) => {
    if (disposed) {
      return
    }
    timeMs = now
    paint(lastFrame, now)
    raf = window.requestAnimationFrame(loop)
  }

  raf = window.requestAnimationFrame(loop)

  return {
    root,
    update: (frame) => {
      lastFrame = frame
      paint(frame, timeMs || performance.now())
    },
    dispose: () => {
      disposed = true
      window.cancelAnimationFrame(raf)
      root.remove()
    },
  }
}
