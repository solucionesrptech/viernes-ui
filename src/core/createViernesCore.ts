import type { ViernesStateStore } from '../state/viernesState'
import { bindStateAttribute } from '../state/viernesState'
import {
  createVoiceModulator,
  type VoiceModulatorFrame,
  type VoiceModulatorHandle,
} from '../voice/createVoiceModulator'

export type ViernesCoreHandle = {
  root: HTMLElement
  setAudioEnergy: (value: number) => void
  setAudioFrame: (frame: VoiceModulatorFrame) => void
  dispose: () => void
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const CX = 400
const CY = 400

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

function arcPath(r: number, startDeg: number, endDeg: number): string {
  const start = polar(r, endDeg)
  const end = polar(r, startDeg)
  const delta = ((endDeg - startDeg) % 360 + 360) % 360
  const large = delta > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`
}

function group(className: string, build: (g: SVGGElement) => void): SVGGElement {
  const g = el('g', { class: className })
  build(g)
  return g
}

function addTicks(
  g: SVGGElement,
  rInner: number,
  rOuter: number,
  count: number,
  className: string,
  majorEvery = 5,
) {
  for (let i = 0; i < count; i += 1) {
    const deg = (360 / count) * i
    const major = i % majorEvery === 0
    const a = polar(rInner, deg)
    const b = polar(major ? rOuter + 4 : rOuter, deg)
    g.appendChild(
      el('line', {
        class: major ? `${className} ${className}--major` : className,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
      }),
    )
  }
}

function addBrightArc(
  g: SVGGElement,
  r: number,
  start: number,
  end: number,
  variant: 'a' | 'b',
) {
  const d = arcPath(r, start, end)
  g.appendChild(
    el('path', {
      class: `vc-bright-arc vc-bright-arc__bloom vc-bright-arc--${variant}`,
      d,
      fill: 'none',
    }),
  )
  g.appendChild(
    el('path', {
      class: `vc-bright-arc vc-bright-arc__glow vc-bright-arc--${variant}`,
      d,
      fill: 'none',
    }),
  )
  g.appendChild(
    el('path', {
      class: `vc-bright-arc vc-bright-arc__body vc-bright-arc--${variant}`,
      d,
      fill: 'none',
    }),
  )
  g.appendChild(
    el('path', {
      class: `vc-bright-arc vc-bright-arc__core vc-bright-arc--${variant}`,
      d,
      fill: 'none',
    }),
  )

  const pStart = polar(r, start)
  const pEnd = polar(r, end)
  for (const p of [pStart, pEnd]) {
    g.appendChild(
      el('circle', {
        class: 'vc-bright-node vc-bright-node__glow',
        cx: p.x,
        cy: p.y,
        r: 7,
      }),
    )
    g.appendChild(
      el('circle', {
        class: 'vc-bright-node',
        cx: p.x,
        cy: p.y,
        r: 3.4,
      }),
    )
  }
}

export function createViernesCore(
  host: HTMLElement,
  store: ViernesStateStore,
): ViernesCoreHandle {
  const root = document.createElement('div')
  root.className = 'viernes-core'
  root.setAttribute('role', 'img')
  root.setAttribute('aria-label', 'Núcleo visual de Viernes')

  const svg = el('svg', {
    class: 'viernes-core__svg',
    viewBox: '0 0 800 800',
    'aria-hidden': 'true',
  })

  const defs = el('defs')

  const glowSoft = el('filter', {
    id: 'vc-glow-soft',
    x: '-60%',
    y: '-60%',
    width: '220%',
    height: '220%',
  })
  glowSoft.appendChild(
    el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '3.5', result: 'b' }),
  )
  const mergeSoft = el('feMerge')
  mergeSoft.appendChild(el('feMergeNode', { in: 'b' }))
  mergeSoft.appendChild(el('feMergeNode', { in: 'SourceGraphic' }))
  glowSoft.appendChild(mergeSoft)
  defs.appendChild(glowSoft)

  const glowStrong = el('filter', {
    id: 'vc-glow-strong',
    x: '-80%',
    y: '-80%',
    width: '260%',
    height: '260%',
  })
  glowStrong.appendChild(
    el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '6', result: 'b' }),
  )
  const mergeStrong = el('feMerge')
  mergeStrong.appendChild(el('feMergeNode', { in: 'b' }))
  mergeStrong.appendChild(el('feMergeNode', { in: 'SourceGraphic' }))
  glowStrong.appendChild(mergeStrong)
  defs.appendChild(glowStrong)

  const glowBloom = el('filter', {
    id: 'vc-glow-bloom',
    x: '-100%',
    y: '-100%',
    width: '300%',
    height: '300%',
  })
  glowBloom.appendChild(
    el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '12', result: 'b' }),
  )
  glowBloom.appendChild(el('feMergeNode', { in: 'b' }))
  // fix: feMerge properly
  glowBloom.replaceChildren(
    el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '12', result: 'b' }),
  )
  const mergeBloom = el('feMerge')
  mergeBloom.appendChild(el('feMergeNode', { in: 'b' }))
  mergeBloom.appendChild(el('feMergeNode', { in: 'SourceGraphic' }))
  glowBloom.appendChild(mergeBloom)
  defs.appendChild(glowBloom)

  const gradCore = el('radialGradient', {
    id: 'vc-core-fill',
    cx: '50%',
    cy: '50%',
    r: '50%',
  })
  gradCore.appendChild(el('stop', { offset: '0%', 'stop-color': '#041018', 'stop-opacity': '0.55' }))
  gradCore.appendChild(el('stop', { offset: '70%', 'stop-color': '#020609', 'stop-opacity': '0.35' }))
  gradCore.appendChild(el('stop', { offset: '100%', 'stop-color': '#020609', 'stop-opacity': '0' }))
  defs.appendChild(gradCore)

  svg.appendChild(defs)

  // Ambient
  svg.appendChild(
    el('circle', {
      class: 'vc-ambient',
      cx: CX,
      cy: CY,
      r: 360,
      fill: 'url(#vc-core-fill)',
    }),
  )

  // GROUP D — nearly static technical field
  svg.appendChild(
    group('vc-group vc-group--static', (g) => {
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--ghost',
          cx: CX,
          cy: CY,
          r: 365,
          fill: 'none',
        }),
      )
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--faint',
          cx: CX,
          cy: CY,
          r: 312,
          fill: 'none',
        }),
      )
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--faint',
          cx: CX,
          cy: CY,
          r: 248,
          fill: 'none',
        }),
      )
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--hair',
          cx: CX,
          cy: CY,
          r: 188,
          fill: 'none',
        }),
      )
      // subtle crosshair
      g.appendChild(
        el('line', {
          class: 'vc-guide',
          x1: CX,
          y1: 55,
          x2: CX,
          y2: 120,
        }),
      )
      g.appendChild(
        el('line', {
          class: 'vc-guide',
          x1: CX,
          y1: 680,
          x2: CX,
          y2: 745,
        }),
      )
      g.appendChild(
        el('line', {
          class: 'vc-guide',
          x1: 55,
          y1: CY,
          x2: 120,
          y2: CY,
        }),
      )
      g.appendChild(
        el('line', {
          class: 'vc-guide',
          x1: 680,
          y1: CY,
          x2: 745,
          y2: CY,
        }),
      )
    }),
  )

  // Outer ticks — very slow CW
  svg.appendChild(
    group('vc-group vc-group--ticks-outer', (g) => {
      addTicks(g, 352, 372, 72, 'vc-tick', 6)
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--thin',
          cx: CX,
          cy: CY,
          r: 348,
          fill: 'none',
        }),
      )
    }),
  )

  // Bright arc A — CW ~26s — upper-left oriented initially
  svg.appendChild(
    group('vc-group vc-group--arc-a', (g) => {
      addBrightArc(g, 335, -35, 115, 'a')
    }),
  )

  // Bright arc B — CCW ~34s — lower-right
  svg.appendChild(
    group('vc-group vc-group--arc-b', (g) => {
      addBrightArc(g, 335, 145, 295, 'b')
    }),
  )

  // Segmented technical scale
  svg.appendChild(
    group('vc-group vc-group--seg-a', (g) => {
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--seg-dense',
          cx: CX,
          cy: CY,
          r: 305,
          fill: 'none',
        }),
      )
      addTicks(g, 292, 302, 48, 'vc-tick-mini', 4)
    }),
  )

  // Mid segmented dashes — CCW
  svg.appendChild(
    group('vc-group vc-group--seg-b', (g) => {
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--seg-gap',
          cx: CX,
          cy: CY,
          r: 275,
          fill: 'none',
        }),
      )
      g.appendChild(
        el('path', {
          class: 'vc-partial vc-partial--mid',
          d: arcPath(268, 20, 95),
          fill: 'none',
        }),
      )
      g.appendChild(
        el('path', {
          class: 'vc-partial vc-partial--mid-dim',
          d: arcPath(268, 200, 280),
          fill: 'none',
        }),
      )
    }),
  )

  // Mid ticks + thin ring — CW faster
  svg.appendChild(
    group('vc-group vc-group--mid', (g) => {
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--thin',
          cx: CX,
          cy: CY,
          r: 238,
          fill: 'none',
        }),
      )
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--dotted',
          cx: CX,
          cy: CY,
          r: 225,
          fill: 'none',
        }),
      )
      addTicks(g, 215, 228, 36, 'vc-tick-mid', 3)
    }),
  )

  // Moving nodes
  svg.appendChild(
    group('vc-group vc-group--nodes', (g) => {
      const nodeAngles = [15, 95, 170, 240, 310]
      nodeAngles.forEach((deg, i) => {
        const p = polar(205, deg)
        g.appendChild(
          el('circle', {
            class: i === 1 ? 'vc-node vc-node--hot' : 'vc-node',
            cx: p.x,
            cy: p.y,
            r: i === 1 ? 3.8 : 2.6,
          }),
        )
      })
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--hair',
          cx: CX,
          cy: CY,
          r: 205,
          fill: 'none',
        }),
      )
    }),
  )

  // Inner technical arcs — CW
  svg.appendChild(
    group('vc-group vc-group--inner-a', (g) => {
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--seg-short',
          cx: CX,
          cy: CY,
          r: 178,
          fill: 'none',
        }),
      )
      g.appendChild(
        el('path', {
          class: 'vc-partial vc-partial--inner',
          d: arcPath(168, -10, 80),
          fill: 'none',
        }),
      )
      g.appendChild(
        el('path', {
          class: 'vc-partial vc-partial--inner-bright',
          d: arcPath(168, 160, 250),
          fill: 'none',
        }),
      )
      const ra = polar(155, 40)
      const rb = polar(172, 40)
      g.appendChild(
        el('line', { class: 'vc-radial', x1: ra.x, y1: ra.y, x2: rb.x, y2: rb.y }),
      )
      const rc = polar(155, 220)
      const rd = polar(172, 220)
      g.appendChild(
        el('line', { class: 'vc-radial vc-radial--soft', x1: rc.x, y1: rc.y, x2: rd.x, y2: rd.y }),
      )
    }),
  )

  // Inner rings — CCW slow
  svg.appendChild(
    group('vc-group vc-group--inner-b', (g) => {
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--thin',
          cx: CX,
          cy: CY,
          r: 145,
          fill: 'none',
        }),
      )
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--faint',
          cx: CX,
          cy: CY,
          r: 132,
          fill: 'none',
        }),
      )
      g.appendChild(
        el('path', {
          class: 'vc-partial vc-partial--deep',
          d: arcPath(120, 50, 140),
          fill: 'none',
        }),
      )
      g.appendChild(
        el('path', {
          class: 'vc-partial vc-partial--deep-dim',
          d: arcPath(120, 210, 310),
          fill: 'none',
        }),
      )
      // micro particles
      for (let i = 0; i < 8; i += 1) {
        const p = polar(138, i * 45 + 8)
        g.appendChild(
          el('circle', {
            class: 'vc-particle',
            'data-i': i,
            cx: p.x,
            cy: p.y,
            r: 1.1,
          }),
        )
      }
    }),
  )

  // Centro limpio + modulador de voz (sin texto)
  let modulator: VoiceModulatorHandle | null = null
  svg.appendChild(
    group('vc-group vc-group--center', (g) => {
      g.appendChild(
        el('circle', {
          class: 'vc-center-glow',
          cx: CX,
          cy: CY,
          r: 96,
          fill: 'none',
        }),
      )
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--center',
          cx: CX,
          cy: CY,
          r: 100,
          fill: 'none',
        }),
      )
      g.appendChild(
        el('circle', {
          class: 'vc-ring vc-ring--center-inner',
          cx: CX,
          cy: CY,
          r: 88,
          fill: 'none',
        }),
      )
      modulator = createVoiceModulator(g)
    }),
  )

  root.appendChild(svg)
  host.replaceChildren(root)

  const unbind = bindStateAttribute(store, root)

  const applyEnergy = (value: number) => {
    const clamped = Math.min(1, Math.max(0, value))
    root.style.setProperty('--v-audio-energy', String(clamped))
    root.dataset.audio = clamped > 0.05 ? 'active' : 'idle'
  }

  return {
    root,
    setAudioEnergy: (value: number) => {
      applyEnergy(value)
      modulator?.update({ audioEnergy: value, active: value > 0.12 })
    },
    setAudioFrame: (frame) => {
      applyEnergy(frame.audioEnergy)
      modulator?.update(frame)
    },
    dispose: () => {
      modulator?.dispose()
      unbind()
      root.remove()
    },
  }
}
