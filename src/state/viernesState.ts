export type ViernesState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'executing'
  | 'success'
  | 'error'

export type ViernesStateListener = (state: ViernesState) => void

export type ViernesStateStore = {
  getState: () => ViernesState
  setState: (state: ViernesState) => void
  subscribe: (listener: ViernesStateListener) => () => void
  dispose: () => void
}

export function createViernesStateStore(
  initial: ViernesState = 'idle',
): ViernesStateStore {
  let state: ViernesState = initial
  const listeners = new Set<ViernesStateListener>()

  const notify = () => {
    for (const listener of listeners) {
      listener(state)
    }
  }

  return {
    getState: () => state,
    setState: (next) => {
      if (next === state) {
        return
      }
      state = next
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      listener(state)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      listeners.clear()
    },
  }
}

export function bindStateAttribute(
  store: ViernesStateStore,
  element: HTMLElement,
): () => void {
  return store.subscribe((next) => {
    element.dataset.state = next
  })
}

export function mapVoiceStatusToViernesState(
  status: 'unsupported' | 'inactive' | 'listening' | 'speaking' | 'error',
): ViernesState {
  switch (status) {
    case 'listening':
      return 'listening'
    case 'speaking':
      return 'speaking'
    case 'error':
    case 'unsupported':
      return 'error'
    case 'inactive':
    default:
      return 'idle'
  }
}
