/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional — improves ERC-20 discovery via Etherscan Sepolia `tokentx`. */
  readonly VITE_ETHERSCAN_API_KEY?: string;
  /** FHERC20NativeUnderlyingWrapper per network (from hardhat deploy). */
  readonly VITE_NATIVE_WRAPPER_SEPOLIA?: string;
  readonly VITE_NATIVE_WRAPPER_BASE_SEPOLIA?: string;
  readonly VITE_NATIVE_WRAPPER_ARBITRUM_SEPOLIA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
