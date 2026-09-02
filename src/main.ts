import './style.css'
import { createCubeScene } from './scene/createCubeScene'
import {
  createVoiceAssistant,
  type VoiceStatus,
} from './voice/createVoiceAssistant'

const canvas = document.querySelector<HTMLCanvasElement>('#scene-canvas')
const voiceToggle = document.querySelector<HTMLButtonElement>('#voice-toggle')
const voiceStatus = document.querySelector<HTMLElement>('#voice-status')
const voiceTranscript = document.querySelector<HTMLElement>('#voice-transcript')
const voiceIndicator = document.querySelector<HTMLElement>('#voice-indicator')
const voiceSelect = document.querySelector<HTMLSelectElement>('#voice-select')
const voicePreview = document.querySelector<HTMLButtonElement>('#voice-preview')

if (
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

const scene = createCubeScene(canvas)
let voiceEnabled = false

const renderVoiceStatus = (status: VoiceStatus, message: string) => {
  voiceStatus.textContent = message
  voiceIndicator.dataset.status = status
}

const voice = createVoiceAssistant({
  onStatusChange: renderVoiceStatus,
  onTranscript: (transcript) => {
    voiceTranscript.textContent = `Escuché: “${transcript}”`
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
    voice.dispose()
    scene.dispose()
  })
}

console.info('[Viernes V0.2] Escena 3D y sistema de voz iniciados.')
