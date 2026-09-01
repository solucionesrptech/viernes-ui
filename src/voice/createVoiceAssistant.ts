type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<{
    0: {
      transcript: string
    }
  }>
}

type SpeechRecognitionErrorEventLike = Event & {
  error: string
}

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onend: (() => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }

export type VoiceStatus =
  | 'unsupported'
  | 'inactive'
  | 'listening'
  | 'speaking'
  | 'error'

type VoiceAssistantOptions = {
  onStatusChange: (status: VoiceStatus, message: string) => void
  onTranscript: (transcript: string) => void
}

export type VoiceAssistant = {
  isSupported: boolean
  start: () => void
  stop: () => void
  dispose: () => void
}

const WAKE_PHRASES = ['hola viernes', 'viernes estas despierta']
const RESPONSE = 'Siempre despierta. ¿Qué vamos a construir?'

function normalizeTranscript(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function createVoiceAssistant(
  options: VoiceAssistantOptions,
): VoiceAssistant {
  const speechWindow = window as SpeechWindow
  const Recognition =
    speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

  if (!Recognition || !('speechSynthesis' in window)) {
    options.onStatusChange(
      'unsupported',
      'El reconocimiento de voz no está disponible en este navegador.',
    )

    return {
      isSupported: false,
      start: () => undefined,
      stop: () => undefined,
      dispose: () => undefined,
    }
  }

  const recognition = new Recognition()
  recognition.lang = 'es-CL'
  recognition.continuous = true
  recognition.interimResults = false

  let enabled = false
  let listening = false
  let speaking = false
  let disposed = false

  const startListening = () => {
    if (!enabled || listening || speaking || disposed) {
      return
    }

    try {
      recognition.start()
    } catch (error) {
      console.warn('[Viernes Voz] No fue posible iniciar el reconocimiento.', error)
    }
  }

  const speak = () => {
    speaking = true
    recognition.abort()
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(RESPONSE)
    utterance.lang = 'es-CL'
    utterance.rate = 1

    utterance.onstart = () => {
      options.onStatusChange('speaking', RESPONSE)
    }

    utterance.onend = () => {
      speaking = false
      startListening()
    }

    utterance.onerror = () => {
      speaking = false
      options.onStatusChange('error', 'No pude reproducir la respuesta de voz.')
      startListening()
    }

    window.speechSynthesis.speak(utterance)
  }

  recognition.onstart = () => {
    listening = true
    options.onStatusChange('listening', 'Escuchando: “Hola, Viernes”')
  }

  recognition.onend = () => {
    listening = false
    startListening()
  }

  recognition.onerror = (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') {
      return
    }

    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      enabled = false
      options.onStatusChange(
        'error',
        'Permiso de micrófono rechazado. Habilítalo en Chromium.',
      )
      return
    }

    options.onStatusChange('error', `Error de reconocimiento: ${event.error}`)
  }

  recognition.onresult = (event) => {
    const lastResult = event.results[event.results.length - 1]
    const transcript = lastResult?.[0]?.transcript?.trim() ?? ''

    if (!transcript) {
      return
    }

    options.onTranscript(transcript)

    const normalized = normalizeTranscript(transcript)
    if (WAKE_PHRASES.some((phrase) => normalized.includes(phrase))) {
      speak()
    }
  }

  return {
    isSupported: true,
    start: () => {
      enabled = true
      startListening()
    },
    stop: () => {
      enabled = false
      speaking = false
      recognition.abort()
      window.speechSynthesis.cancel()
      options.onStatusChange('inactive', 'Viernes en espera')
    },
    dispose: () => {
      disposed = true
      enabled = false
      recognition.abort()
      window.speechSynthesis.cancel()
    },
  }
}
