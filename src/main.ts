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

if (
  !canvas ||
  !voiceToggle ||
  !voiceStatus ||
  !voiceTranscript ||
  !voiceIndicator
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
})

if (!voice.isSupported) {
  voiceToggle.disabled = true
  voiceToggle.textContent = 'Voz no disponible'
}

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
