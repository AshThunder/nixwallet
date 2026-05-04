/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REGISTRY_SEPOLIA: string;
  readonly VITE_REGISTRY_BASE_SEPOLIA: string;
  readonly VITE_REGISTRY_ARB_SEPOLIA: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
