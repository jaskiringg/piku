import { useEffect, useRef } from 'react'

// Premium animated "neural network" backdrop. Drifting nodes, synapse links that
// fade with distance, and pulses that fire along connections — for depth behind
// the World-Model graph. Pure canvas; no deps. Cheap (no per-node shadowBlur).

interface Node { x: number; y: number; vx: number; vy: number; r: number }
interface Pulse { a: number; b: number; t: number; speed: number }

const LINK = 150

export function NeuralBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0, h = 0, raf = 0
    let nodes: Node[] = []
    let pulses: Pulse[] = []

    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.max(46, Math.min(110, Math.round((w * h) / 20000)))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.16, vy: (Math.random() - 0.5) * 0.16,
        r: 0.8 + Math.random() * 1.8,
      }))
      pulses = []
    }
    resize()
    window.addEventListener('resize', resize)

    const frame = () => {
      ctx.clearRect(0, 0, w, h)

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy
        if (n.x < 0 || n.x > w) n.vx *= -1
        if (n.y < 0 || n.y > h) n.vy *= -1
      }

      // synapse links
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d = Math.hypot(dx, dy)
          if (d < LINK) {
            const o = (1 - d / LINK) * 0.18
            ctx.strokeStyle = `rgba(56,189,248,${o})`
            ctx.lineWidth = 0.6
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
          }
        }
      }

      // nodes — halo + core (no shadowBlur, cheap)
      for (const n of nodes) {
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 3.2, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(34,211,238,0.06)'; ctx.fill()
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(125,211,252,0.5)'; ctx.fill()
      }

      // fire pulses along nearby connections
      if (Math.random() < 0.06 && nodes.length > 3) {
        const a = (Math.random() * nodes.length) | 0
        const b = (Math.random() * nodes.length) | 0
        if (a !== b) {
          const dx = nodes[a].x - nodes[b].x, dy = nodes[a].y - nodes[b].y
          if (Math.hypot(dx, dy) < LINK * 1.4) pulses.push({ a, b, t: 0, speed: 0.012 + Math.random() * 0.02 })
        }
      }
      pulses = pulses.filter(p => p.t < 1)
      ctx.shadowColor = 'rgba(103,232,249,0.9)'
      ctx.shadowBlur = 8
      for (const p of pulses) {
        p.t += p.speed
        const a = nodes[p.a], b = nodes[p.b]
        if (!a || !b) continue
        const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t
        ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(210,250,255,0.95)'; ctx.fill()
      }
      ctx.shadowBlur = 0

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={ref} className="absolute inset-0 w-full h-full" style={{ opacity: 0.55 }} />
}
