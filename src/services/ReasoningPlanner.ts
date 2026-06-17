import { ollamaService } from './OllamaService'

// The reasoning-flow planner. Before Piku answers a non-trivial request, it first decides whether
// the request is SIMPLE (a direct task/command/greeting/quick fact → just do it) or COMPLEX (needs
// analysis → show the understand-the-problem map and a plan before executing). The Agent renders
// this as the right-side flow: UNDERSTAND → PLAN → ACT. Simple requests skip the graphs entirely.

export interface ReasoningFlow {
  simple: boolean
  understand?: string[]   // key aspects / sub-questions of the problem
  plan?: string[]         // ordered steps to resolve it
}

const SYSTEM = `You are Piku's planning module. Look at the user's latest message and classify it.

SIMPLE = a direct task or command (open an app, search the web, list files), a greeting, small talk,
an insult/vent, or a quick factual question. These need no plan.
COMPLEX = anything needing analysis, multiple steps, research, comparison, design, or judgment.

Return ONLY JSON, nothing else:
- If simple:  {"simple": true}
- If complex: {"simple": false,
    "understand": ["3-5 short phrases naming the key aspects or sub-questions of the problem"],
    "plan": ["3-6 short imperative steps to resolve it"]}
Each phrase/step must be under 8 words. No markdown, no prose.`

export async function planReasoning(message: string): Promise<ReasoningFlow> {
  const out = await ollamaService.chatJSON<ReasoningFlow>([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: message },
  ])
  // Fail open to "simple" so a planner hiccup never blocks the actual answer.
  if (!out || typeof out.simple !== 'boolean') return { simple: true }
  if (out.simple) return { simple: true }
  return {
    simple: false,
    understand: Array.isArray(out.understand) ? out.understand.filter(Boolean).slice(0, 5) : [],
    plan:       Array.isArray(out.plan)       ? out.plan.filter(Boolean).slice(0, 6)       : [],
  }
}
