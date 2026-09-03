export type VoiceModulatorFrame = {
  audioEnergy: number
  frequencyData?: Uint8Array
  waveformData?: Uint8Array
  active?: boolean
}

export type VoiceModulatorHandle = {
  root: SVGGElement
  update: (frame: VoiceModulatorFrame) => void
  dispose: () => void
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const CX = 400
const CY = 400
const BAR_COUNT = 48
const RING_COUNT = 4

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

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return {
    x: CX + r * Math.cos(rad),
    y: CY + r * Math.sin(rad),
  }
}

/**
 * Modulador de voz abstracto en el centro del núcleo (SVG).
 * Sin texto. Idle vivo; speaking reacciona a energy / frequency / waveform.
 */
export function createVoiceModulator(parent: SVGElement): VoiceModulatorHandle {
  const root = el('g', { class: 'vc-modulator' })

  const pulseRings: SVGCircleElement[] = []
  for (let i = 0; i < RING_COUNT; i += 1) {
    const ring = el('circle', {
      class: 'vc-modulator__pulse',
      'data-i': i,
      cx: CX,
      cy: CY,
      r: 42 + i * 14,
      fill: 'none',
    })
    pulseRings.push(ring)
    root.appendChild(ring)
  }

  const waveform = el('path', {
    class: 'vc-modulator__wave',
    fill: 'none',
  })
  root.appendChild(waveform)

  const barsGroup = el('g', { class: 'vc-modulator__bars' })
  const bars: SVGLineElement[] = []
  for (let i = 0; i < BAR_COUNT; i += 1) {
    const deg = (360 / BAR_COUNT) * i
    const inner = polar(48, deg)
    const outer = polar(58, deg)
    const bar = el('line', {
      class: 'vc-modulator__bar',
      'data-i': i,
      x1: inner.x,
      y1: inner.y,
      x2: outer.x,
      y2: outer.y,
    })
    bars.push(bar)
    barsGroup.appendChild(bar)
  }
  root.appendChild(barsGroup)

  const particlesGroup = el('g', { class: 'vc-modulator__particles' })
  const particles: SVGCircleElement[] = []
  for (let i = 0; i < 10; i += 1) {
    const p = polar(62 + (i % 3) * 8, i * 36)
    const dot = el('circle', {
      class: 'vc-modulator__particle',
      'data-i': i,
      cx: p.x,
      cy: p.y,
      r: 1.2,
    })
    particles.push(dot)
    particlesGroup.appendChild(dot)
  }
  root.appendChild(particlesGroup)

  const coreRing = el('circle', {
    class: 'vc-modulator__core-ring',
    cx: CX,
    cy: CY,
    r: 36,
    fill: 'none',
  })
  root.appendChild(coreRing)

  parent.appendChild(root)

  let disposed = false
  let idlePhase = 0
  let raf = 0
  let lastFrame: VoiceModulatorFrame = { audioEnergy: 0, active: false }

  const sampleBin = (data: Uint8Array | undefined, index: number, fallback: number) => {
    if (!data || data.length === 0) {
      return fallback
    }
    const i = Math.min(data.length - 1, Math.floor((index / BAR_COUNT) * data.length))
    return data[i]! / 255
  }

  const buildWavePath = (energy: number, wave: Uint8Array | undefined, t: number) => {
    const points: string[] = []
    const samples = 64
    for (let i = 0; i <= samples; i += 1) {
      const deg = (360 / samples) * i
      const fromWave = wave
        ? (wave[Math.floor((i / samples) * (wave.length - 1))]! / 255 - 0.5) * 2
        : Math.sin(t * 2.2 + i * 0.35) * 0.35
      const amp = 8 + energy * 28
      const r = 70 + fromWave * amp * (0.35 + energy * 0.65)
      const p = polar(r, deg)
      points.push(`${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    }
    points.push('Z')
    return points.join(' ')
  }

  const paint = (frame: VoiceModulatorFrame, timeMs: number) => {
    if (disposed) {
      return
    }

    const t = timeMs * 0.001
    const active = Boolean(frame.active)
    const energy = Math.min(1, Math.max(0, frame.audioEnergy))
    const idleAmp = 0.04 + Math.sin(t * 1.4) * 0.025 + Math.sin(t * 2.7) * 0.015
    const e = active ? energy : idleAmp

    root.dataset.active = active ? 'true' : 'false'
    root.dataset.level =
      e < 0.15 ? 'low' : e < 0.45 ? 'mid' : e < 0.75 ? 'high' : 'peak'

    const scale = 1 + e * 0.07
    root.setAttribute(
      'transform',
      `translate(${CX} ${CY}) scale(${scale.toFixed(4)}) translate(${-CX} ${-CY})`,
    )

    for (let i = 0; i < bars.length; i += 1) {
      const bin = sampleBin(frame.frequencyData, i, 0.2 + Math.sin(t * 3 + i * 0.4) * 0.1)
      const mirrored = Math.min(bin, sampleBin(frame.frequencyData, BAR_COUNT - 1 - i, bin))
      const h = active
        ? 6 + mirrored * (18 + e * 34)
        : 4 + (0.35 + Math.sin(t * 2 + i * 0.25) * 0.35) * 5
      const deg = (360 / BAR_COUNT) * i
      const innerR = 46
      const outerR = innerR + h
      const a = polar(innerR, deg)
      const b = polar(outerR, deg)
      const bar = bars[i]!
      bar.setAttribute('x1', String(a.x))
      bar.setAttribute('y1', String(a.y))
      bar.setAttribute('x2', String(b.x))
      bar.setAttribute('y2', String(b.y))
      bar.setAttribute('opacity', String(0.25 + e * 0.65 + mirrored * 0.2))
    }

    waveform.setAttribute('d', buildWavePath(e, frame.waveformData, t))
    waveform.setAttribute('opacity', String(0.2 + e * 0.55))

    pulseRings.forEach((ring, i) => {
      const base = 44 + i * 13
      const r = base + e * (6 + i * 3) + Math.sin(t * (1.2 + i * 0.3)) * (1 + e * 2)
      ring.setAttribute('r', String(r))
      ring.setAttribute('opacity', String(0.08 + e * (0.18 - i * 0.02)))
    })

    particles.forEach((dot, i) => {
      const orbit = 58 + (i % 3) * 10 + e * 12
      const deg = i * 36 + t * (12 + e * 40) * (i % 2 === 0 ? 1 : -1)
      const p = polar(orbit, deg)
      dot.setAttribute('cx', String(p.x))
      dot.setAttribute('cy', String(p.y))
      dot.setAttribute('opacity', String(0.15 + e * 0.7))
      dot.setAttribute('r', String(1 + e * 1.6))
    })

    coreRing.setAttribute('r', String(34 + e * 8))
    coreRing.setAttribute('opacity', String(0.3 + e * 0.45))
  }

  const loop = (timeMs: number) => {
    if (disposed) {
      return
    }
    idlePhase = timeMs
    paint(lastFrame, timeMs)
    raf = window.requestAnimationFrame(loop)
  }

  raf = window.requestAnimationFrame(loop)

  return {
    root,
    update: (frame) => {
      lastFrame = frame
      paint(frame, idlePhase || performance.now())
    },
    dispose: () => {
      disposed = true
      window.cancelAnimationFrame(raf)
      root.remove()
    },
  }
}
