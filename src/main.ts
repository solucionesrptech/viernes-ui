import './style.css'
import { createViernesCore } from './core/createViernesCore'
import { createCubeScene } from './scene/createCubeScene'
import { createAiShell } from './shell/createAiShell'
import {
  bindStateAttribute,
  createViernesStateStore,
  mapVoiceStatusToViernesState,
} from './state/viernesState'
import { createAudioProbe } from './voice/createAudioProbe'
import {
  createVoiceAssistant,
  type VoiceStatus,
} from './voice/createVoiceAssistant'

const app = document.querySelector<HTMLElement>('#app')
const coreHost = document.querySelector<HTMLElement>('#viernes-core-host')
const canvas = document.querySelector<HTMLCanvasElement>('#scene-canvas')
const voiceToggle = document.querySelector<HTMLButtonElement>('#voice-toggle')
const voiceStatus = document.querySelector<HTMLElement>('#voice-status')
const voiceTranscript = document.querySelector<HTMLElement>('#voice-transcript')
const voiceIndicator = document.querySelector<HTMLElement>('#voice-indicator')
const voiceSelect = document.querySelector<HTMLSelectElement>('#voice-select')
const voicePreview = document.querySelector<HTMLButtonElement>('#voice-preview')

if (
  !app ||
  !coreHost ||
  !canvas ||
  !voiceToggle ||
  !voiceStatus ||
  !voiceTranscript ||
  !voiceIndicator ||
  !voiceSelect ||
  !voicePreview
) {
  throw new Error('Faltan elementos requeridos de la interfaz. Revisa index.html.')
}

const store = createViernesStateStore('idle')
const unbindAppState = bindStateAttribute(store, app)
const core = createViernesCore(coreHost, store)
const scene = createCubeScene(canvas)
const audioProbe = createAudioProbe()

const shell = createAiShell({
  root: app,
  onWorkspaceChange: () => {
    window.dispatchEvent(new Event('resize'))
  },
})

let voiceEnabled = false
let probeFrame = 0
let speaking = false

const stopProbeLoop = () => {
  if (probeFrame !== 0) {
    window.cancelAnimationFrame(probeFrame)
    probeFrame = 0
  }
}

const startProbeLoop = () => {
  stopProbeLoop()
  const tick = () => {
    const sample = audioProbe.sample()
    core.setAudioFrame({
        active: speaking || sample.audioEnergy > 0.12,
        audioEnergy: sample.audioEnergy,
        waveformData: sample.waveformData,
    })
    probeFrame = window.requestAnimationFrame(tick)
  }
  probeFrame = window.requestAnimationFrame(tick)
}

startProbeLoop()

const WAKE_HINTS = ['hola viernes', 'viernes estas despierta']

function normalizeTranscript(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const renderVoiceStatus = (status: VoiceStatus, message: string) => {
  voiceStatus.textContent = message
  voiceIndicator.dataset.status = status
  store.setState(mapVoiceStatusToViernesState(status))

  speaking = status === 'speaking'
  audioProbe.setSpeaking(speaking)
}

const voice = createVoiceAssistant({
  onStatusChange: renderVoiceStatus,
  onTranscript: (transcript) => {
    voiceTranscript.textContent = `Escuché: “${transcript}”`
    const normalized = normalizeTranscript(transcript)
    if (WAKE_HINTS.some((phrase) => normalized.includes(phrase))) {
      store.setState('thinking')
    }
  },
  onVoicesChange: (voices, selectedVoiceUri) => {
    voiceSelect.replaceChildren(
      ...voices.map((availableVoice) => {
        const option = document.createElement('option')
        option.value = availableVoice.voiceURI
        option.textContent = `${availableVoice.name} (${availableVoice.lang})`
        option.selected = availableVoice.voiceURI === selectedVoiceUri
        return option
      }),
    )

    voiceSelect.disabled = voices.length === 0
    voicePreview.disabled = voices.length === 0
  },
})

if (!voice.isSupported) {
  voiceToggle.disabled = true
  voiceToggle.textContent = 'Voz no disponible'
}

voiceSelect.addEventListener('change', () => {
  voice.selectVoice(voiceSelect.value)
})

voicePreview.addEventListener('click', () => {
  store.setState('thinking')
  voice.previewVoice()
})

voiceToggle.addEventListener('click', () => {
  voiceEnabled = !voiceEnabled

  if (voiceEnabled) {
    voice.start()
    voiceToggle.textContent = 'Desactivar Viernes'
    voiceToggle.dataset.active = 'true'
    return
  }

  voice.stop()
  voiceToggle.textContent = 'Activar Viernes'
  delete voiceToggle.dataset.active
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopProbeLoop()
    audioProbe.dispose()
    voice.dispose()
    scene.dispose()
    core.dispose()
    shell.dispose()
    unbindAppState()
    store.dispose()
  })
}

console.info('[Viernes] AI Shell + modulador de voz + workspace espacial iniciados.')
