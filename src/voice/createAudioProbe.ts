export type AudioProbeFrame = {
  audioEnergy: number
  frequencyData: Uint8Array
  waveformData: Uint8Array
}

export type AudioProbeHandle = {
  /** Conecta un elemento audio/video para análisis real vía Web Audio API. */
  connectMediaElement: (element: HTMLMediaElement) => void
  /** Conecta un MediaStream (micrófono u otra fuente). */
  connectStream: (stream: MediaStream) => void
  /**
   * SpeechSynthesis no expone MediaElement en Chromium.
   * Activa un sobre sintético suavizado mientras habla el TTS del navegador.
   */
  setSpeaking: (speaking: boolean) => void
  sample: () => AudioProbeFrame
  dispose: () => void
}

const FREQ_BINS = 64
const WAVE_BINS = 128

/**
 * Sonda de audio: AnalyserNode real cuando hay MediaElement/Stream;
 * fallback suavizado para SpeechSynthesis.
 */
export function createAudioProbe(): AudioProbeHandle {
  let context: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null =
    null
  let speaking = false
  let smoothedEnergy = 0
  let synthPhase = 0
  let disposed = false

  const freqBuffer = new Uint8Array(FREQ_BINS)
  const waveBuffer = new Uint8Array(WAVE_BINS)
  const outFreq = new Uint8Array(FREQ_BINS)
  const outWave = new Uint8Array(WAVE_BINS)

  const ensureGraph = async () => {
    if (disposed) {
      return null
    }
    if (!context) {
      context = new AudioContext()
      analyser = context.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.82
    }
    if (context.state === 'suspended') {
      await context.resume()
    }
    return { context, analyser: analyser! }
  }

  const connectMediaElement = (element: HTMLMediaElement) => {
    void ensureGraph().then((graph) => {
      if (!graph || disposed) {
        return
      }
      if (source) {
        source.disconnect()
        source = null
      }
      source = graph.context.createMediaElementSource(element)
      source.connect(graph.analyser)
      source.connect(graph.context.destination)
    })
  }

  const connectStream = (stream: MediaStream) => {
    void ensureGraph().then((graph) => {
      if (!graph || disposed) {
        return
      }
      if (source) {
        source.disconnect()
        source = null
      }
      source = graph.context.createMediaStreamSource(stream)
      source.connect(graph.analyser)
    })
  }

  const fillSynthetic = (energy: number) => {
    synthPhase += 0.18
    for (let i = 0; i < FREQ_BINS; i += 1) {
      const band =
        energy *
        (0.35 +
          0.65 *
            Math.abs(
              Math.sin(synthPhase * (1.1 + i * 0.04) + i * 0.35) *
                Math.cos(synthPhase * 0.7 + i * 0.11),
            ))
      freqBuffer[i] = Math.round(Math.min(255, band * 255))
    }
    for (let i = 0; i < WAVE_BINS; i += 1) {
      const w =
        0.5 +
        Math.sin(synthPhase * 2.4 + i * 0.22) * energy * 0.35 +
        Math.sin(synthPhase * 5.1 + i * 0.5) * energy * 0.2
      waveBuffer[i] = Math.round(Math.min(255, Math.max(0, w * 255)))
    }
  }

  return {
    connectMediaElement,
    connectStream,
    setSpeaking: (next) => {
      speaking = next
      if (next) {
        void ensureGraph()
      }
    },
    sample: () => {
      let instant = 0

      if (analyser && source) {
        analyser.getByteFrequencyData(freqBuffer)
        analyser.getByteTimeDomainData(waveBuffer)
        let sum = 0
        for (let i = 0; i < freqBuffer.length; i += 1) {
          sum += freqBuffer[i]!
        }
        instant = sum / (freqBuffer.length * 255)
      } else if (speaking) {
        const burst =
          0.35 +
          0.35 * Math.abs(Math.sin(performance.now() * 0.011)) +
          0.2 * Math.abs(Math.sin(performance.now() * 0.027)) +
          0.1 * Math.random()
        instant = Math.min(1, burst)
        fillSynthetic(instant)
      } else {
        instant = 0.03 + 0.02 * Math.abs(Math.sin(performance.now() * 0.002))
        fillSynthetic(instant * 0.4)
      }

      smoothedEnergy = smoothedEnergy * 0.8 + instant * 0.2
      outFreq.set(freqBuffer)
      outWave.set(waveBuffer)

      return {
        audioEnergy: smoothedEnergy,
        frequencyData: outFreq,
        waveformData: outWave,
      }
    },
    dispose: () => {
      disposed = true
      try {
        source?.disconnect()
        analyser?.disconnect()
        void context?.close()
      } catch (error) {
        console.warn('[Viernes AudioProbe] Error al liberar AudioContext.', error)
      }
      source = null
      analyser = null
      context = null
    },
  }
}
