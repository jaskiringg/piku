// OrbCore — Piku presence layer.
//
// "A constellation held in a sphere."
//
// The sphere silhouette is locked and approved. This file controls only
// motion, depth, state behavior, and perception.
//
// Depth hierarchy (front → back):
//   Foreground weave  — sharpest, defines sphere shape, stable
//   Intersection bloom — blurred duplicate, natural crossing brightening
//   Mid weave          — slight blur, slightly dimmer, breathes gently
//   Fine mesh          — close-range texture, always subtle
//   Memory hubs        — 7 fixed soft points, pulse independently
//   Hidden pathways    — near-invisible at rest, surfaces during Thinking
//   Deep interior      — heavy blur, barely there at rest, illuminates during Thinking
//   Thought currents   — 5 rare slow travelers, barely visible at idle

import { motion } from 'framer-motion'
import type { PresenceState } from '../../../types'
import {
  sphereBreathVariants,
  atmosphereVariants,
  deepWebVariants,
  foregroundWeaveVariants,
  midWeaveVariants,
  bloomVariants,
  hiddenPathwayVariants,
  hubVariants,
  pulseVariants,
} from '../variants'

// ── Deterministic PRNG ─────────────────────────────────────────────────────

const _RND = (() => {
  const a: number[] = []
  let s = 0x29A
  for (let i = 0; i < 1024; i++) {
    s = Math.imul(s ^ (s >>> 17), 0x45d9f3b) ^ Math.imul(s, 0x119de1f3)
    a.push((s >>> 0) / 0xFFFFFFFF)
  }
  return a
})()
let _ri = 0
const rnd   = () => _RND[_ri++ % _RND.length]
const reset = () => { _ri = 0 }

// ── Geometry ───────────────────────────────────────────────────────────────

const R        = 118
const SVG_SIZE = 380
const HALF     = SVG_SIZE / 2

// ── Path generators ────────────────────────────────────────────────────────

function genStrands(count: number, r: number, gravity: number, chaos: number): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const φ1 = Math.acos(2 * rnd() - 1)
    const θ1 = rnd() * Math.PI * 2
    const x1 = r * Math.sin(φ1) * Math.cos(θ1)
    const y1 = r * Math.sin(φ1) * Math.sin(θ1)
    const φ2 = Math.acos(2 * rnd() - 1)
    const θ2 = rnd() * Math.PI * 2
    const x2 = r * Math.sin(φ2) * Math.cos(θ2)
    const y2 = r * Math.sin(φ2) * Math.sin(θ2)
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    const cx = mx * (1 - gravity) + (rnd() - 0.5) * chaos
    const cy = my * (1 - gravity) + (rnd() - 0.5) * chaos
    out.push(`M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`)
  }
  return out
}

function genLocalMesh(count: number, r: number): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const φ  = Math.acos(2 * rnd() - 1)
    const θ  = rnd() * Math.PI * 2
    const x1 = r * Math.sin(φ) * Math.cos(θ)
    const y1 = r * Math.sin(φ) * Math.sin(θ)
    const dφ  = (rnd() - 0.5) * 0.65
    const dθ  = (rnd() - 0.5) * 0.65
    const φ2  = Math.max(0.05, Math.min(Math.PI - 0.05, φ + dφ))
    const x2  = r * Math.sin(φ2) * Math.cos(θ + dθ)
    const y2  = r * Math.sin(φ2) * Math.sin(θ + dθ)
    const cx = (x1 + x2) / 2 * 0.84
    const cy = (y1 + y2) / 2 * 0.84
    out.push(`M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`)
  }
  return out
}

// ── Pre-generate paths ─────────────────────────────────────────────────────

reset()
const deepPaths    = genStrands(200, R - 4, 0.87, 24)   // deep interior
const weavePaths1  = genStrands(110, R,     0.70, 42)   // foreground
const weavePaths2  = genStrands(90,  R,     0.56, 34)   // mid
const meshPaths    = genLocalMesh(100, R - 6)            // close texture
const hiddenPaths  = genStrands(60, R + 2,  0.92, 14)   // hidden deep strands

// 5 thought currents — pulled from the structural weave so they trace real paths.
// Durations and delays are deliberately irrational — they will never synchronize.
// Long repeatDelays mean at any moment you see 0 or 1 current, never a stream.
const CURRENTS = [
  { d: weavePaths1[2],  dur: 11.4, delay:  0.5, rest: 18 },
  { d: weavePaths1[8],  dur: 15.8, delay:  7.2, rest: 26 },
  { d: weavePaths1[17], dur:  9.6, delay: 14.5, rest: 14 },
  { d: weavePaths1[31], dur: 18.3, delay:  3.1, rest: 30 },
  { d: weavePaths1[44], dur: 13.1, delay: 21.8, rest: 22 },
]

// ── Memory hubs ────────────────────────────────────────────────────────────
// 7 fixed positions within the sphere interior — plausible strand crossings.
// Each has a unique delay so they pulse on completely independent schedules.
// At rest they are dim; during Thinking they become momentarily luminous.
// They should be discovered, not announced.
const HUBS = [
  { x: -54, y: -42, r: 3.2, delay:  0.4 },
  { x:  63, y: -57, r: 2.8, delay:  3.1 },
  { x: -76, y:  16, r: 3.0, delay:  6.8 },
  { x:  70, y:  31, r: 3.4, delay:  1.9 },
  { x: -28, y:  76, r: 2.6, delay:  9.5 },
  { x:  47, y:  69, r: 3.1, delay:  4.7 },
  { x:   6, y: -87, r: 2.5, delay: 12.2 },
]

// New presence states reuse the three tuned base motions (the approved animation stays untouched);
// distinctness for those states comes from which base they map to + a per-state cue (e.g. the
// "strand woven in" during `updating`). acting = mind working (thinking); speaking = oriented
// toward you (listening); updating = connections forming (thinking) + the woven-strand overlay.
type BaseMotion = 'idle' | 'listening' | 'thinking'
function baseMotion(s: PresenceState): BaseMotion {
  switch (s) {
    case 'acting':
    case 'updating':  return 'thinking'
    case 'speaking':  return 'listening'
    case 'listening': return 'listening'
    case 'thinking':  return 'thinking'
    default:          return 'idle'
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function WeaveLayer({
  paths, stroke, sw, filter,
}: { paths: string[]; stroke: string; sw: number; filter?: string }) {
  return (
    <g filter={filter}>
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
      ))}
    </g>
  )
}

// Memory hubs — soft glowing points at intersection-like positions.
// No circles are "drawn" visually; they are entirely dissolved by the blur filter
// into soft luminous regions that feel like natural strand crossings.
function MemoryHubs({ base }: { base: BaseMotion }) {
  return (
    <g filter="url(#f-hub)" style={{ mixBlendMode: 'screen' }}>
      {HUBS.map((hub, i) => (
        <motion.circle
          key={i}
          cx={hub.x}
          cy={hub.y}
          r={hub.r}
          fill="rgba(147,197,253,1)"
          variants={hubVariants(hub.delay)}
          animate={base}
        />
      ))}
    </g>
  )
}

// Thought currents — single points of light that travel along strands.
// strokeDasharray "3 600" = a 3-unit dash in a 600-unit gap.
// At this ratio the "current" is a single traveling point, not a segment.
// ease: easeInOut makes it slow in and slow out — emerging and settling,
// not electrical.
function ThoughtCurrents() {
  return (
    <>
      {CURRENTS.map((c, i) => (
        <motion.path
          key={i}
          d={c.d}
          fill="none"
          stroke="rgba(147,197,253,0.92)"
          strokeWidth={0.65}
          strokeDasharray="3 600"
          initial={{ strokeDashoffset: 600 }}
          animate={{ strokeDashoffset: [600, 0] }}
          transition={{
            duration: c.dur,
            repeat: Infinity,
            repeatDelay: c.rest,
            delay: c.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  state: PresenceState
}

export function OrbCore({ state }: Props) {
  const base = baseMotion(state)   // the three tuned base motions drive every layer
  return (
    // Scale breathing lives here. No translation, no rotation — only breath.
    // Listening holds at scale 1.0: the stillness is the signal.
    <motion.div
      className="relative flex items-center justify-center pointer-events-none select-none"
      style={{ width: SVG_SIZE, height: SVG_SIZE }}
      variants={sphereBreathVariants}
      animate={base}
    >

      {/* CSS outer haze — dims during Listening (focus), moderate during Thinking */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: R * 2.7, height: R * 2.7,
          top: '50%', left: '50%', x: '-50%', y: '-50%',
          background: [
            'radial-gradient(circle,',
            '  rgba(96,165,250,0.16) 0%,',
            '  rgba(59,130,246,0.08) 38%,',
            '  rgba(37,99,235,0.02) 62%,',
            '  transparent 74%)',
          ].join(' '),
          filter: 'blur(28px)',
        }}
        variants={atmosphereVariants}
        animate={base}
      />

      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`${-HALF} ${-HALF} ${SVG_SIZE} ${SVG_SIZE}`}
        className="absolute inset-0"
        aria-hidden
      >
        <defs>
          {/* Deep interior — very heavy blur, creates volumetric inner haze */}
          <filter id="f-deep" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6.0" />
          </filter>

          {/* Mid layer — slight blur for depth separation */}
          <filter id="f-mid" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Bloom — heavier blur for intersection crossing brightening */}
          <filter id="f-bloom" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>

          {/* Hub — soft wide bloom for memory intersection points */}
          <filter id="f-hub" x="-250%" y="-250%" width="600%" height="600%">
            <feGaussianBlur stdDeviation="3.0" />
          </filter>

          {/* Current — narrow halo on thought current paths */}
          <filter id="f-current" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/*
          mixBlendMode: screen — all light adds together.
          Where many strands overlap (sphere interior) the region brightens.
          At the sphere's edge, strands thin out and the space naturally darkens.
          The silhouette is a consequence of density, not a drawn boundary.
        */}
        <g style={{ mixBlendMode: 'screen' }}>

          {/*
            LAYER 1: Deep interior (back)
            200 strands, high gravity (all curving through center), 6px blur.
            At rest: barely visible, a faint inner warmth.
            During Thinking: illuminates — specific deep regions activate.
            The deep layer is the visual metaphor of memory coming to surface.
          */}
          <motion.g variants={deepWebVariants} animate={base}>
            <WeaveLayer
              paths={deepPaths}
              stroke="rgba(59,130,246,0.52)"
              sw={1.05}
              filter="url(#f-deep)"
            />
          </motion.g>

          {/*
            LAYER 2: Hidden pathways (deep, revealed only in Thinking)
            60 very high-gravity strands arcing almost entirely through the center.
            In Idle: whisper at 0→0.04→0 over 22s. The sense of an interior.
            In Thinking: surface dramatically and retreat — memories appearing.
            Two groups at different phases so they pulse independently.
          */}
          <motion.g variants={hiddenPathwayVariants(0)} animate={base}>
            <WeaveLayer
              paths={hiddenPaths.slice(0, 32)}
              stroke="rgba(147,197,253,0.88)"
              sw={0.58}
              filter="url(#f-mid)"
            />
          </motion.g>
          <motion.g variants={hiddenPathwayVariants(5.2)} animate={base}>
            <WeaveLayer
              paths={hiddenPaths.slice(32)}
              stroke="rgba(96,165,250,0.76)"
              sw={0.50}
              filter="url(#f-mid)"
            />
          </motion.g>

          {/*
            LAYER 3: Memory hubs
            7 fixed soft glow points at strand-intersection positions.
            Pulse on independent schedules — no two share a rhythm.
            In Idle: dim, barely noticeable.
            In Thinking: briefly luminous. "A connection being remembered."
          */}
          <MemoryHubs base={base} />

          {/*
            LAYER 4: Mid weave
            90 strands at lower gravity (more tangential, visible near edge).
            Slight blur creates depth separation from foreground.
            Breathes gently so there is subtle interior variation at rest.
          */}
          <motion.g variants={midWeaveVariants} animate={base}>
            <WeaveLayer
              paths={weavePaths2}
              stroke="rgba(96,165,250,0.42)"
              sw={0.58}
              filter="url(#f-mid)"
            />
          </motion.g>

          {/*
            LAYER 5: Fine local mesh (always subtle)
            100 short local connections — visible only up close.
            Static opacity: it is always there, never animated.
            "Made of relationships" — the granularity the eye discovers.
          */}
          <g opacity={0.22}>
            <WeaveLayer
              paths={meshPaths}
              stroke="rgba(147,197,253,0.38)"
              sw={0.40}
            />
          </g>

          {/*
            LAYER 6: Foreground weave (front, sharpest)
            110 strands — highest opacity, no blur, defines the sphere silhouette.
            Stable across states. This is the structure of the mind.
            Slightly dims in Thinking so activated regions stand out against it.
          */}
          <motion.g variants={foregroundWeaveVariants} animate={base}>
            <WeaveLayer
              paths={weavePaths1}
              stroke="rgba(96,165,250,0.54)"
              sw={0.70}
            />
          </motion.g>

          {/*
            LAYER 7: Intersection bloom (foreground)
            Same foreground paths, rendered again at heavy blur and lower opacity.
            Screen blending: where strands cross, brightness adds up naturally.
            These natural crossing brightening are the "memory hubs" that emerge
            from density — not drawn, just a consequence of the weave.
          */}
          <motion.g variants={bloomVariants} animate={base}>
            <WeaveLayer
              paths={weavePaths1}
              stroke="rgba(96,165,250,0.62)"
              sw={1.15}
              filter="url(#f-bloom)"
            />
          </motion.g>

          {/*
            UPDATING cue — a new strand woven into the mind. Shown only while Piku is writing the
            turn into the World Model (GDD: "updating memory = a new thread woven in"). One brief
            motion: a near-white strand draws itself along a real path, then settles. Appears for no
            other state, so it never competes with the resting weave (orb law: one motion at a time).
          */}
          {state === 'updating' && (
            <motion.g
              style={{ mixBlendMode: 'screen' }}
              filter="url(#f-current)"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.55] }}
              transition={{ duration: 1.3, ease: 'easeInOut' }}
            >
              {[weavePaths1[5], weavePaths1[23]].map((d, i) => (
                <motion.path
                  key={i}
                  d={d}
                  fill="none"
                  stroke="rgba(224,242,255,0.95)"
                  strokeWidth={0.95}
                  strokeLinecap="round"
                  strokeDasharray="600 600"
                  initial={{ strokeDashoffset: 600 }}
                  animate={{ strokeDashoffset: 0 }}
                  transition={{ duration: 1.1, delay: i * 0.22, ease: 'easeInOut' }}
                />
              ))}
            </motion.g>
          )}

          {/*
            LAYER 8: Thought currents
            5 single points of light that travel along existing strands.
            At rest (idle): group opacity 0.14 — barely perceptible, occasional stir.
            In Listening: group opacity 0 — complete focus, no wandering.
            In Thinking: fully visible.

            Each current has a unique duration and long repeatDelay.
            At any moment you see 0 or 1 — never a stream.
            Each appearance feels like a single connection being traced.
          */}
          <motion.g variants={pulseVariants} animate={base} filter="url(#f-current)">
            <ThoughtCurrents />
          </motion.g>

        </g>
      </svg>
    </motion.div>
  )
}
