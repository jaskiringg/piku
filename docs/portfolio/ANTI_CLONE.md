# Anti-clone redaction checklist

Apply before every public draft (GitHub showcase, Atlas `/work`, PDF).

## Goal

Prove systems thinking. Do **not** ship a rebuild kit. A reader with Claude should still need discovery and judgment to recreate anything.

## Allowed

- Problem, constraints, non-goals
- Feature catalogs (behavior, not recipes)
- Mermaid workflows / state / sequence at behavior level
- Architecture boxes, trust boundaries, why
- Conceptual data model (entities + relationships + field *purpose*)
- ADRs, trade-offs, failures
- Testing / rollout approach (sanitized)
- Screenshots with PII blurred

## Never publish

- [ ] Full production prompts / system prompts / tool schemas verbatim
- [ ] Env vars, API keys, project IDs, webhook secrets
- [ ] Copy-paste SQL migrations / full DDL + RLS that recreate the product
- [ ] Step-by-step clone-and-run production recipes
- [ ] Exact proprietary score weights (use bands / signal names)
- [ ] Customer ERP field maps, real Kafka topic names, real payloads
- [ ] Sensitive internal runbooks (generalize)
- [ ] Enough business rules for a competitor twin

## Pattern

| Instead of | Write |
|---|---|
| Full prompt | Prompt *roles* + inputs/outputs |
| `CREATE TABLE` | ER + “lead has score band, SLA, assignment state” |
| Exact weights | Weighted signals: intent, channel, latency — tuned from ops |
| curl rebuild | Sequence diagram of a turn |
| Real phones in SS | Blur / synthetic |

## Sign-off

Doc: ________  Reviewer: ________  Date: ________  
Anti-clone pass: [ ] yes
