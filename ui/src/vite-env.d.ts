/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base origin of FastAPI (no path). Enables split-host UI vs API. */
  readonly VITE_BACKEND_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
