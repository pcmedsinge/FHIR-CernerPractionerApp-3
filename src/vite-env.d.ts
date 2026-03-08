/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FHIR_BASE_URL: string
  readonly VITE_CLIENT_ID: string
  readonly VITE_REDIRECT_URI: string
  readonly VITE_AUTH_ENDPOINT: string
  readonly VITE_TOKEN_ENDPOINT: string
  readonly VITE_SCOPES: string
  readonly VITE_OPENAI_API_KEY: string
  readonly VITE_OPENAI_MODEL: string
  readonly VITE_OPENAI_ORG_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
