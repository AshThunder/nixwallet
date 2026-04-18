/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional — improves ERC-20 discovery via Etherscan Sepolia `tokentx`. */
  readonly VITE_ETHERSCAN_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
