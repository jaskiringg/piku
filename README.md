# Piku

<p align="center">
  <img src="docs/screenshots/piku-logo.png" alt="Piku" width="180" />
</p>

**Local-first ambient AI companion** that builds a personal World Model from conversation, memory, and context — running entirely on your machine.

<p align="center">
  <img src="docs/screenshots/app.png" alt="Piku app" width="420" />
</p>

## What it does

Piku sits quietly on your desktop and learns your world over time:

- **Ambient** — always available, minimally intrusive
- **Local-first** — Tauri + React frontend, Ollama for local LLMs
- **Memory-driven** — structured memory + knowledge graph (“World Model”)
- **Extensible** — apps/integrations feed the observation loop

## Stack

| Layer | Tech |
|---|---|
| Desktop shell | Tauri 2 |
| UI | React 18, Vite, Framer Motion |
| Local AI | Ollama |
| Storage | IndexedDB / local vault |

## Why it matters

Most AI chats are ephemeral tabs. Piku is a **companion that remembers** — so context compounds instead of resetting every session.

## Run

```bash
npm install
npm run tauri dev
```

Requires Node 20+ and a local Ollama install for chat.

## Docs

See [`docs/CANONICAL/`](docs/CANONICAL/) for product vision, architecture, and roadmap.
