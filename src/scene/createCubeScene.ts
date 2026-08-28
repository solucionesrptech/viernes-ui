import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'

export type SceneHandle = {
  renderer: WebGLRenderer
  dispose: () => void
}

export function createCubeScene(canvas: HTMLCanvasElement): SceneHandle {
  const scene = new Scene()
  scene.background = new Color(0x0b0f14)

  const camera = new PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.set(2.4, 1.8, 3.2)
  camera.lookAt(0, 0, 0)

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  const cube = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({
      color: 0x3d8bfd,
      metalness: 0.25,
      roughness: 0.35,
    }),
  )
  scene.add(cube)

  const ambient = new AmbientLight(0xffffff, 0.45)
  const keyLight = new DirectionalLight(0xffffff, 1.1)
  keyLight.position.set(4, 6, 3)
  scene.add(ambient, keyLight)

  let frameId = 0
  let disposed = false

  const resize = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) {
      return
    }
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }

  const onWindowResize = () => {
    resize()
  }

  window.addEventListener('resize', onWindowResize)
  resize()

  const renderLoop = (timeMs: number) => {
    if (disposed) {
      return
    }
    const t = timeMs * 0.001
    cube.rotation.x = t * 0.35
    cube.rotation.y = t * 0.55
    renderer.render(scene, camera)
    frameId = window.requestAnimationFrame(renderLoop)
  }

  frameId = window.requestAnimationFrame(renderLoop)

  return {
    renderer,
    dispose: () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onWindowResize)
      cube.geometry.dispose()
      cube.material.dispose()
      renderer.dispose()
    },
  }
}
