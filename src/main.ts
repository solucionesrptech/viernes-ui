import './style.css'
import { createCubeScene } from './scene/createCubeScene'

const canvas = document.querySelector<HTMLCanvasElement>('#scene-canvas')

if (!canvas) {
  throw new Error('No se encontró #scene-canvas. Revisa index.html.')
}

const scene = createCubeScene(canvas)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    scene.dispose()
  })
}

console.info('[Viernes V0.1] Escena 3D iniciada (cubo).')
