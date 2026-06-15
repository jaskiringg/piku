// Motion system for Piku's woven-sphere presence.
//
// State intent:
//   Idle      — "I am here."              Patient. Alive. Independent rhythms.
//   Listening — "I am paying attention."   Still. Structural clarity. Positive orientation.
//   Thinking  — "Connections are forming." Sequential. Sparse. Specific. Never global.
//
// Design law:
//   Every element has its own clock.
//   No two layers share a duration in any state.
//   Comprehension emerges in sequence, not simultaneously.

import type { Variants } from 'framer-motion'

// ── Transition characters ─────────────────────────────────────────────────
//
// Each destination state has a distinct transition feel.
// The way you arrive at a state IS part of the emotional language.
//
// RELEASE: long exhale. Slow, decelerating. Returning to rest.
// SETTLE:  deliberate settling into stillness. Like holding a breath.
// ARRIVE:  purposeful. A thought becoming clear. Confident.

const RELEASE = { duration: 2.8, ease: [0.38, 0, 0.62, 1.0] as [number, number, number, number] }
const SETTLE  = { duration: 2.2, ease: [0.22, 0.8, 0.40, 1.0] as [number, number, number, number] }
const ARRIVE  = { duration: 1.6, ease: [0.20, 0.0, 0.40, 1.0] as [number, number, number, number] }

// ── Sphere breathing ───────────────────────────────────────────────────────
//
// Idle:      Extremely slow (14s). Amplitude 1.025 — you feel it more than see it.
//
// Listening: Holds completely still. Scale 1.0. The stillness IS the attention.
//            A person paying undivided attention stops fidgeting.
//
// Thinking:  Asymmetric keyframe — two unequal peaks with a micro-pause between.
//            [1 → 1.033 → 1.005 → 1.028 → 1] at 6.5s.
//            Not faster breathing. A qualitatively different rhythm.
//            The slight hesitation at 1.005 is the breath caught mid-thought.

export const sphereBreathVariants: Variants = {
  idle: {
    scale: [1, 1.025, 1],
    // times: rise fast (38%), fall slow (62%) — exhale longer than inhale
    transition: { duration: 14, repeat: Infinity, ease: 'easeInOut' as const, times: [0, 0.38, 1] },
  },
  listening: {
    scale: 1.0,
    transition: SETTLE,
  },
  thinking: {
    scale: [1, 1.033, 1.005, 1.028, 1],
    // Explicit times make the hesitation at 1.005 occupy real duration (22% of 6.5s ≈ 1.4s).
    // Without times, framer-motion distributes evenly and the catch-breath is imperceptible.
    transition: { duration: 6.5, repeat: Infinity, ease: 'easeInOut' as const, times: [0, 0.32, 0.54, 0.76, 1] },
  },
}

// ── Outer atmospheric haze ─────────────────────────────────────────────────
//
// Idle:      16s — its own clock, independent of the sphere's 14s.
//            The small difference means they slowly drift in and out of phase.
//
// Listening: 0.30 — dims and contracts. Less diffuse = more coherent.
//            Does not pulse. Holds.
//
// Thinking:  10s — significantly decoupled from sphere (6.5s) and deep (9.4s).
//            The atmosphere has its own understanding of time.

export const atmosphereVariants: Variants = {
  idle: {
    // Delta narrowed from 0.20 → 0.08. Felt, not seen. Removes the dominant "pulse" read.
    opacity: [0.40, 0.48, 0.40],
    transition: { duration: 16, repeat: Infinity, ease: 'easeInOut' as const },
  },
  listening: {
    opacity: 0.30,
    transition: SETTLE,
  },
  thinking: {
    // Delta narrowed from 0.18 → 0.08. Atmosphere warms gently, doesn't compete with selective activations.
    opacity: [0.44, 0.52, 0.44],
    transition: { duration: 10, repeat: Infinity, ease: 'easeInOut' as const },
  },
}

// ── Deep interior layer ────────────────────────────────────────────────────
//
// 200 heavily blurred strands. The deepest depth plane.
//
// Idle:      20s — slowest of all layers. The interior has the longest memory.
//            Opacity 0.08–0.15 — barely conscious. You sense depth, not light.
//
// Listening: 0.06 — the interior quiets further. Background noise drops.
//            The foreground becomes the clearest thing in the field.
//
// Thinking:  9.4s — its own rate, decoupled from sphere (6.5s) and atmosphere (10s).
//            Opacity rises to 0.50 at peak — the deep interior illuminating.
//            This is the visual correlate of memory being accessed.
//            But because it's at a different rate than everything else,
//            the deep activation rarely coincides with surface activation.

export const deepWebVariants: Variants = {
  idle: {
    opacity: [0.08, 0.15, 0.08],
    transition: { duration: 20, repeat: Infinity, ease: 'easeInOut' as const },
  },
  listening: {
    opacity: 0.06,
    transition: SETTLE,
  },
  thinking: {
    // Sparse single illumination, not continuous oscillation.
    // 5s initial delay: hidden pathways and hubs begin their first activations before the interior rises.
    // 10s oscillation reaches 0.44 — the deep memory surface, then retreats.
    // 8s rest: the interior settles and holds dark. Total cycle ≈ 18s.
    // At any moment during Thinking, expect the deep layer to be dark more often than lit.
    // When it rises, it feels like a memory being accessed, not like a background process running.
    opacity: [0.18, 0.44, 0.18],
    // delay: 4s — deep interior responds after surface sequence has begun, not before.
    transition: { duration: 10, repeat: Infinity, repeatDelay: 8, delay: 4, ease: 'easeInOut' as const },
  },
}

// ── Foreground weave ───────────────────────────────────────────────────────
//
// The primary visible strand network. Sharpest. Defines the sphere silhouette.
//
// Idle:      0.52, stable. The structure of the mind at rest.
//
// Listening: 0.68 — the HIGHEST opacity in any state.
//            This is the positive signal of attention. When Piku listens,
//            the sphere's structure becomes most clear and most present.
//            The surface of the mind orients toward you.
//            Combined with everything else dimming, the sphere reads as:
//            "I see you" not just "I went quiet."
//
// Thinking:  0.46 — slightly dimmed.
//            Activated regions (hubs, hidden paths) must stand out against
//            the background weave. Dimming the foreground makes the
//            selective activation legible.

export const foregroundWeaveVariants: Variants = {
  idle: {
    opacity: 0.52,
    transition: RELEASE,
  },
  listening: {
    opacity: 0.68,
    // 1.2s delay: by this point currents (1.0s) and hidden paths (1.0s) are already gone.
    // The system finishes going quiet before the structure brightens.
    // Two-beat sequence: silence → clarity. Not one simultaneous mode switch.
    transition: { ...SETTLE, delay: 1.2 },
  },
  thinking: {
    opacity: 0.46,
    transition: ARRIVE,
  },
}

// ── Mid weave ──────────────────────────────────────────────────────────────
//
// The secondary strand layer. Slight blur. Establishes depth.
//
// Idle:      11.5s — its own rate. Faster than the sphere (14s) and atmosphere (16s).
//            Creates a sense of independent interior motion.
//
// Listening: 0.30, stable. Settles. The background quiets.
//
// Thinking:  STABLE at 0.30. Does NOT pulse.
//            The mid layer is background structure, not active participant.
//            In Thinking, only specific elements activate.
//            Keeping the mid layer stable ensures activation is REGIONAL,
//            not global.

export const midWeaveVariants: Variants = {
  idle: {
    opacity: [0.24, 0.34, 0.24],
    transition: { duration: 11.5, repeat: Infinity, ease: 'easeInOut' as const },
  },
  listening: {
    opacity: 0.30,
    transition: SETTLE,
  },
  thinking: {
    opacity: 0.30,
    transition: ARRIVE,
  },
}

// ── Intersection bloom ─────────────────────────────────────────────────────
//
// Foreground weave rendered again at heavy blur. Screen blending creates
// natural brightening where strands cross. Brightness is precious.
//
// Idle:      19s — the longest cycle of the visible layers. Drifts very slowly.
//            Creates a subtle sense that the interior has its own long memory.
//
// Listening: 0.10, stable. Less diffuse = sharper apparent structure.
//
// Thinking:  7.8s — between the sphere (6.5s) and deep (9.4s), but equal to neither.
//            The bloom brightening is on its own clock.

export const bloomVariants: Variants = {
  idle: {
    opacity: [0.10, 0.18, 0.10],
    transition: { duration: 19, repeat: Infinity, ease: 'easeInOut' as const },
  },
  listening: {
    opacity: 0.10,
    transition: SETTLE,
  },
  thinking: {
    // Range narrowed: 0.10 → 0.06 delta. Bloom supports connections, doesn't announce them.
    // 3s initial delay: bloom brightens only after pathways begin surfacing, not simultaneously with state entry.
    opacity: [0.12, 0.18, 0.12],
    transition: { duration: 7.8, repeat: Infinity, delay: 3, ease: 'easeInOut' as const },
  },
}

// ── Hidden pathways ────────────────────────────────────────────────────────
//
// 60 high-gravity strands: the "beneath the surface" of the mind.
//
// Idle:      Single-peak whisper. [0, 0.04, 0] — one quiet rise, one quiet fall.
//            Not a double peak. Not a designed waveform. Just a breath.
//            Group A: 25s. Group B: 32s. These rates share no common factor below 800s.
//            They will almost never coincide. The interior shifts independently.
//
// Listening: 0, immediately. Complete interior stillness.
//
// Thinking:  Single-arc per group — a memory surfaces and settles back.
//            NOT a double peak. One clean emergence.
//            Group A (delay=0): 12s cycle, starts after 3s.
//            Group B (delay=5.2): 17s cycle, starts after 5.5s.
//            Sequential activation: A appears first, B appears after A is visible.
//            The two groups never peak simultaneously.
//
//            The delay parameter encodes which group this is:
//              delay=0   → Group A: 12s cycle, 0.80 peak, 3.0s initial delay
//              delay=5.2 → Group B: 17s cycle, 0.72 peak, 5.5s initial delay

export const hiddenPathwayVariants = (delay: number): Variants => ({
  idle: {
    opacity: [0, 0.04, 0],
    transition: {
      duration: delay === 0 ? 25 : 32,
      repeat: Infinity,
      delay: delay * 5.0,
      ease: 'easeInOut' as const,
    },
  },
  listening: {
    opacity: 0,
    // 1.0s: fast enough that silence reads as immediate, not gradual
    transition: { duration: 1.0 },
  },
  thinking: {
    opacity: [0, delay === 0 ? 0.80 : 0.72, 0],
    transition: {
      duration: delay === 0 ? 12 : 17,
      repeat: Infinity,
      repeatDelay: delay === 0 ? 5.0 : 8.0,
      // Group A starts at ~1s — the first thing that stirs in Thinking.
      // Group B starts at ~4.5s — clearly after A has surfaced and begun retreating.
      delay: delay === 0 ? 1.0 : 4.5,
      ease: 'easeInOut' as const,
    },
  },
})

// ── Memory hub brightening ─────────────────────────────────────────────────
//
// 7 fixed intersection points. Each has its own clock. They are never
// synchronized and never announce themselves — they are discovered.
//
// Idle:      Each hub has its own duration (10.5–25.6s range).
//            Phase offsets are large enough that no two hubs are near their
//            peak at the same time. The brightening wanders across the sphere
//            slowly, like attention drifting across memories.
//
// Listening: STABLE at 0.26. Not pulsing. Fixed reference points.
//            When Piku listens, its internal memories hold still —
//            no new connections form while receiving.
//            This is the most important behavioral distinction of Listening.
//
// Thinking:  Durations 8.4–19s range (formula: 8 + delay*0.9).
//            Phase offsets are large: delay*1.8 — enough that the fastest hub
//            (delay=0.4 → 8.4s cycle, offset 0.72s) and a slower hub
//            (delay=6.8 → 14.1s cycle, offset 12.2s) will rarely be near
//            their peaks simultaneously.
//            At any moment, expect 0 or 1 hub near luminance peak.
//            Each activation feels like a specific memory being touched,
//            not a region lighting up.

export const hubVariants = (delay: number): Variants => ({
  idle: {
    opacity: [0.14, 0.30, 0.14],
    transition: {
      duration: 10.5 + delay * 1.2,
      repeat: Infinity,
      delay: delay * 1.8,
      ease: 'easeInOut' as const,
    },
  },
  listening: {
    opacity: 0.26,
    transition: SETTLE,
  },
  thinking: {
    // Floor lowered from 0.20 → 0.08. Between peaks, hubs return to near-dark.
    // The 0.74 luminance now appears from darkness — a single specific connection, not an intensification.
    // repeatDelay scales with hub delay: slowest hubs rest longest (up to ~9s).
    // At any moment, expect most hubs to be near-dark with 0 or 1 near their peak.
    opacity: [0.08, 0.74, 0.08],
    transition: {
      duration: 8 + delay * 0.9,
      repeat: Infinity,
      repeatDelay: 2.0 + delay * 0.6,
      delay: delay * 1.8,
      ease: 'easeInOut' as const,
    },
  },
})

// ── Thought currents group opacity ────────────────────────────────────────
//
// The group that wraps the 5 rare traveling dashes.
// Individual current timing is set in OrbCore — they have very different
// durations and very long rest periods.
//
// Idle:      0.14 — barely perceptible. An occasional sense of something passing.
//            Not enough to consciously track. Just enough to feel alive.
//
// Listening: 0. Complete stillness. A listener is not forming new connections —
//            they are receiving. The interior goes quiet.
//
// Thinking:  Fades in over 2.5s.
//            The first current won't appear until 4+ seconds into Thinking
//            (set by individual current delays in OrbCore).
//            This means: the hidden pathways surface first.
//            Then: a hub brightens.
//            Then: a current traces.
//            Comprehension builds in sequence, not simultaneously.

export const pulseVariants: Variants = {
  idle: {
    opacity: 0.14,
    transition: { duration: 3 },
  },
  listening: {
    opacity: 0,
    // 1.0s: matches hidden pathway disappearance speed. Both vanish together as "silence falls."
    transition: { duration: 1.0 },
  },
  thinking: {
    opacity: 1,
    // delay: 2.0s — currents become visible only after hidden pathways have begun surfacing (t=1s).
    // Sequence: pathways stir → currents enable → hubs activate → deep responds.
    transition: { duration: 2.5, delay: 2.0 },
  },
}
