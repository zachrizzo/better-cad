/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY?: string
  readonly VITE_AI_PROXY_WS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
