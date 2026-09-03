type SpeechRecognitionEventLike = Event & {
  resultIndex: number
  results: ArrayLike<{
    isFinal?: boolean
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
  onVoicesChange: (voices: SpeechSynthesisVoice[], selectedVoiceUri: string) => void
}

export type VoiceAssistant = {
  isSupported: boolean
  start: () => void
  stop: () => void
  selectVoice: (voiceUri: string) => void
  previewVoice: () => void
  dispose: () => void
}

const CORE_BASE_URL = 'http://127.0.0.1:8000'
const WAKE_PHRASES = [
  'hola viernes',
  'hola vienes',
  'hola bienes',
  'ola viernes',
  'viernes estas despierta',
  'viernes estas despierto',
]
const WAKE_WINDOW_MS = 3500
const VOICE_STORAGE_KEY = 'viernes.voice-uri'
const PREFERRED_FEMALE_NAMES = [
  'dalia',
  'elvira',
  'helena',
  'laura',
  'sabina',
  'paulina',
  'catalina',
]

function normalizeTranscript(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesWakePhrase(normalized: string): boolean {
  if (WAKE_PHRASES.some((phrase) => normalized.includes(phrase))) {
    return true
  }

  // Frases partidas típicas de SpeechRecognition continuous.
  const hasHola = /\bhola\b/.test(normalized) || /\bola\b/.test(normalized)
  const hasViernes =
    /\bviernes\b/.test(normalized) ||
    /\bvienes\b/.test(normalized) ||
    /\bbienes\b/.test(normalized)

  return hasHola && hasViernes
}

function voiceScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLocaleLowerCase('es')
  const lang = voice.lang.toLocaleLowerCase('es')
  let score = 0

  if (lang === 'es-cl') score += 100
  else if (lang.startsWith('es')) score += 60
  if (PREFERRED_FEMALE_NAMES.some((candidate) => name.includes(candidate))) score += 30
  if (name.includes('natural') || name.includes('google')) score += 20
  if (voice.localService) score += 5

  return score
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
      selectVoice: () => undefined,
      previewVoice: () => undefined,
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
  let selectedVoice: SpeechSynthesisVoice | undefined
  let currentAudio: HTMLAudioElement | null = null
  let currentAudioUrl: string | null = null
  let recentFinals: Array<{ text: string; at: number }> = []
  let lastWakeAt = 0

  const loadVoices = () => {
    const spanishVoices = window.speechSynthesis
      .getVoices()
      .filter((voice) => voice.lang.toLocaleLowerCase('es').startsWith('es'))
      .sort((a, b) => voiceScore(b) - voiceScore(a))

    const storedVoiceUri = window.localStorage.getItem(VOICE_STORAGE_KEY)
    selectedVoice =
      spanishVoices.find((voice) => voice.voiceURI === storedVoiceUri) ??
      spanishVoices[0]

    options.onVoicesChange(spanishVoices, selectedVoice?.voiceURI ?? '')
  }

  window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
  loadVoices()

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

  const cleanupAudio = () => {
    currentAudio?.pause()
    currentAudio = null

    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl)
      currentAudioUrl = null
    }
  }

  const speakWithCore = async (text: string) => {
    speaking = true
    recognition.abort()
    window.speechSynthesis.cancel()
    cleanupAudio()
    options.onStatusChange('speaking', 'Viernes está respondiendo…')

    try {
      const response = await fetch(`${CORE_BASE_URL}/respond/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) {
        throw new Error(`Viernes Core respondió ${response.status}`)
      }

      const audioBlob = await response.blob()
      currentAudioUrl = URL.createObjectURL(audioBlob)
      currentAudio = new Audio(currentAudioUrl)

      currentAudio.onended = () => {
        cleanupAudio()
        speaking = false
        startListening()
      }

      currentAudio.onerror = () => {
        cleanupAudio()
        speaking = false
        options.onStatusChange('error', 'No pude reproducir la respuesta de Viernes Core.')
        startListening()
      }

      try {
        await currentAudio.play()
      } catch (playError) {
        console.warn('[Viernes Voz] Autoplay bloqueado; usando voz del navegador.', playError)
        cleanupAudio()
        speaking = false
        previewBrowserVoice('Bienvenido, señor.')
      }
    } catch (error) {
      cleanupAudio()
      speaking = false
      console.error('[Viernes Voz] Falló la respuesta del Core; fallback local.', error)
      options.onStatusChange(
        'speaking',
        'Core no disponible — usando voz local.',
      )
      previewBrowserVoice('Bienvenido, señor.')
    }
  }

  const previewBrowserVoice = (text: string) => {
    speaking = true
    recognition.abort()
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = selectedVoice ?? null
    utterance.lang = selectedVoice?.lang ?? 'es-CL'
    utterance.rate = 0.92
    utterance.pitch = 1.04

    utterance.onstart = () => {
      options.onStatusChange('speaking', text)
    }

    utterance.onend = () => {
      speaking = false
      startListening()
    }

    utterance.onerror = () => {
      speaking = false
      options.onStatusChange('error', 'No pude reproducir la vista previa de voz.')
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
    if (speaking) {
      return
    }

    const now = Date.now()
    const pieces: string[] = []

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      if (!result) {
        continue
      }
      if (result.isFinal === false) {
        continue
      }
      const piece = result[0]?.transcript?.trim()
      if (piece) {
        pieces.push(piece)
      }
    }

    if (pieces.length === 0) {
      const fallback = event.results[event.results.length - 1]?.[0]?.transcript?.trim()
      if (fallback) {
        pieces.push(fallback)
      }
    }

    if (pieces.length === 0) {
      return
    }

    const transcript = pieces.join(' ').trim()
    options.onTranscript(transcript)
    console.info('[Viernes Voz] Escuchado:', transcript)

    recentFinals.push({ text: transcript, at: now })
    recentFinals = recentFinals.filter((entry) => now - entry.at <= WAKE_WINDOW_MS)

    const combined = normalizeTranscript(
      recentFinals.map((entry) => entry.text).join(' '),
    )

    if (!matchesWakePhrase(combined)) {
      return
    }

    if (now - lastWakeAt < 2000) {
      return
    }

    lastWakeAt = now
    recentFinals = []
    console.info('[Viernes Voz] Wake detectado:', combined)
    void speakWithCore(combined || transcript)
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
      cleanupAudio()
      window.speechSynthesis.cancel()
      options.onStatusChange('inactive', 'Viernes en espera')
    },
    selectVoice: (voiceUri) => {
      selectedVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.voiceURI === voiceUri)

      if (selectedVoice) {
        window.localStorage.setItem(VOICE_STORAGE_KEY, selectedVoice.voiceURI)
      }
    },
    previewVoice: () => {
      previewBrowserVoice('Hola. Soy Viernes y estoy lista para trabajar.')
    },
    dispose: () => {
      disposed = true
      enabled = false
      recognition.abort()
      cleanupAudio()
      window.speechSynthesis.cancel()
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
    },
  }
}
