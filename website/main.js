import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js"

const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false

const canvas = document.getElementById("bg3")
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Missing #bg3 canvas")

const state = {
  running: false,
  frame: 0,
  w: 0,
  h: 0,
  renderer: null,
  scene: null,
  camera: null,
  group: null,
  points: null,
  lines: null,
  base: null,
  pos: null,
  linePos: null,
  links: null,
  mouseX: 0,
  mouseY: 0,
  lastT: 0,
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

function resize() {
  const rect = canvas.getBoundingClientRect()
  state.w = Math.max(320, Math.floor(rect.width))
  state.h = Math.max(320, Math.floor(rect.height))
  const r = state.renderer
  const c = state.camera
  if (!r || !c) return
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  r.setSize(state.w, state.h, false)
  c.aspect = state.w / state.h
  c.updateProjectionMatrix()
}

function makeScene() {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100)
  camera.position.set(0, 0, 16.5)

  const group = new THREE.Group()
  scene.add(group)

  const count = clamp(Math.round((window.innerWidth * window.innerHeight) / 5200), 520, 1300)
  const base = new Float32Array(count * 3)
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)

  const spread = 9.5
  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3
    const x = (Math.random() - 0.5) * spread * 2
    const y = (Math.random() - 0.5) * spread * 2
    const z = (Math.random() - 0.5) * spread * 1.35
    base[i3 + 0] = x
    base[i3 + 1] = y
    base[i3 + 2] = z
    pos[i3 + 0] = x
    pos[i3 + 1] = y
    pos[i3 + 2] = z

    const isServer = i % 13 === 0
    const isBridge = !isServer && i % 7 === 0
    const r = isServer ? 0.70 : isBridge ? 0.95 : 0.34
    const g = isServer ? 1.0 : isBridge ? 0.36 : 0.42
    const b = isServer ? 0.70 : isBridge ? 0.48 : 0.55
    col[i3 + 0] = r
    col[i3 + 1] = g
    col[i3 + 2] = b
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  geom.setAttribute("color", new THREE.BufferAttribute(col, 3))

  const points = new THREE.Points(
    geom,
    new THREE.PointsMaterial({
      size: 0.06,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.92,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  group.add(points)

  const linkCount = clamp(Math.round(count * 0.9), 520, 1300)
  const links = new Uint16Array(linkCount * 2)
  for (let i = 0; i < linkCount; i += 1) {
    const a = Math.floor(Math.random() * count)
    const b = Math.floor(Math.random() * count)
    links[i * 2 + 0] = a
    links[i * 2 + 1] = b
  }

  const linePos = new Float32Array(linkCount * 2 * 3)
  const lineGeom = new THREE.BufferGeometry()
  lineGeom.setAttribute("position", new THREE.BufferAttribute(linePos, 3))

  const lines = new THREE.LineSegments(
    lineGeom,
    new THREE.LineBasicMaterial({
      transparent: true,
      opacity: 0.18,
      color: 0x93a4ff,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  group.add(lines)

  state.renderer = renderer
  state.scene = scene
  state.camera = camera
  state.group = group
  state.points = points
  state.lines = lines
  state.base = base
  state.pos = pos
  state.linePos = linePos
  state.links = links

  resize()
}

function updateLines() {
  const pos = state.pos
  const lp = state.linePos
  const links = state.links
  if (!pos || !lp || !links) return
  const n = links.length / 2
  for (let i = 0; i < n; i += 1) {
    const a = links[i * 2 + 0] * 3
    const b = links[i * 2 + 1] * 3
    const o = i * 6
    lp[o + 0] = pos[a + 0]
    lp[o + 1] = pos[a + 1]
    lp[o + 2] = pos[a + 2]
    lp[o + 3] = pos[b + 0]
    lp[o + 4] = pos[b + 1]
    lp[o + 5] = pos[b + 2]
  }
  state.lines.geometry.attributes.position.needsUpdate = true
}

function tick(t) {
  if (!state.running) return
  state.frame = requestAnimationFrame(tick)

  const dt = state.lastT ? (t - state.lastT) / 1000 : 0
  state.lastT = t

  const renderer = state.renderer
  const scene = state.scene
  const camera = state.camera
  const group = state.group
  const points = state.points

  if (!renderer || !scene || !camera || !group || !points) return

  if (prefersReducedMotion) {
    renderer.render(scene, camera)
    return
  }

  const time = t * 0.00026
  const base = state.base
  const pos = state.pos

  const drift = 0.85
  const swirl = 0.55
  const pulse = 0.4 + Math.sin(t * 0.0009) * 0.15

  for (let i = 0; i < pos.length; i += 3) {
    const x0 = base[i + 0]
    const y0 = base[i + 1]
    const z0 = base[i + 2]
    const k = i * 0.0031
    const sx = Math.sin(time * 2.2 + k) * drift
    const sy = Math.cos(time * 1.9 + k * 1.2) * drift
    const sz = Math.sin(time * 2.6 + k * 0.7) * (drift * 0.55)
    const rx = x0 * Math.cos(time * 0.8) - y0 * Math.sin(time * 0.8)
    const ry = x0 * Math.sin(time * 0.8) + y0 * Math.cos(time * 0.8)
    pos[i + 0] = rx + sx * swirl
    pos[i + 1] = ry + sy * swirl
    pos[i + 2] = z0 + sz
  }

  points.geometry.attributes.position.needsUpdate = true
  updateLines()

  const mx = clamp(state.mouseX, -1, 1)
  const my = clamp(state.mouseY, -1, 1)
  group.rotation.x += ((-my * 0.22) - group.rotation.x) * clamp(dt * 2.4, 0, 1)
  group.rotation.y += ((mx * 0.26) - group.rotation.y) * clamp(dt * 2.4, 0, 1)
  group.rotation.z = Math.sin(time * 0.7) * 0.035
  group.position.z = Math.sin(time * 1.1) * 0.35
  state.lines.material.opacity = 0.12 + pulse * 0.12

  renderer.render(scene, camera)
}

function start() {
  if (state.running) return
  state.running = true
  if (!state.renderer) makeScene()
  resize()
  state.lastT = 0
  state.frame = requestAnimationFrame(tick)
}

function stop() {
  if (!state.running) return
  state.running = false
  cancelAnimationFrame(state.frame)
  state.frame = 0
}

let resizeTimer = 0
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    resize()
  }, 140)
})

window.addEventListener("pointermove", (e) => {
  const w = window.innerWidth || 1
  const h = window.innerHeight || 1
  state.mouseX = (e.clientX / w) * 2 - 1
  state.mouseY = (e.clientY / h) * 2 - 1
})

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") stop()
  else start()
})

start()
