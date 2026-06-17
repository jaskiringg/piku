/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Local-only GitHub tokens (set in .env.local, gitignored — never committed).
  readonly VITE_GH_PERSONAL_TOKEN?: string
  readonly VITE_GH_OFFICE_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
