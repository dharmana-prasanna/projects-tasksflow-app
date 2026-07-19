/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHEETS_SCRIPT_URL?: string
  /** Shared app password; empty/unset disables the login gate. */
  readonly VITE_APP_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
