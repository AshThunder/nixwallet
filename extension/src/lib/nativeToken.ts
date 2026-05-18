/**
 * Native asset sentinel and per-network WETH addresses for FHERC20NativeWrapper.
 * @see https://cofhe-docs.fhenix.zone/fhe-library/confidential-contracts/fherc20/fherc20-wrapper
 */
import { ethers } from 'ethers';
import type { NetworkId } from './wallet';

/** Token list / wrap UI sentinel for chain native currency (ETH). */
export const NATIVE_TOKEN_ADDRESS = 'native';

export const NATIVE_TOKEN_METADATA = {
  symbol: 'ETH',
  name: 'Ether',
  address: NATIVE_TOKEN_ADDRESS,
  decimals: 18,
} as const;

export function isNativeTokenAddress(address: string): boolean {
  const a = address.toLowerCase();
  return a === NATIVE_TOKEN_ADDRESS || a === ethers.ZeroAddress.toLowerCase();
}

/** WETH used by FHERC20NativeWrapper for `shieldWrappedNative`. */
export const WETH_ADDRESSES: Partial<Record<NetworkId, string>> = {
  sepolia: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
  baseSepolia: '0x4200000000000000000000000000000000000006',
  arbitrumSepolia: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73',
};

/**
 * Deployed FHERC20NativeUnderlyingWrapper per network.
 * Set via `npm run deploy:native` in hardhat/ and paste addresses here,
 * or override at build time with VITE_NATIVE_WRAPPER_<NETWORK_ID> (uppercase).
 */
export const NATIVE_WRAPPER_ADDRESSES: Partial<Record<NetworkId, string>> = {
  sepolia: '0x55Ee31F5706D91e0E48C48B5dBc6e14aD7afA3d2',
  baseSepolia: '0xCC5935e2D653a8e32151e8cB342795485BEbdF50',
  arbitrumSepolia: '0x9323c32a9759A5F5dF4340e8309Fb639da8c5a29',
};

function envNativeWrapper(networkId: NetworkId): string | undefined {
  if (typeof import.meta.env === 'undefined') return undefined;
  const map: Record<NetworkId, string | undefined> = {
    sepolia: import.meta.env.VITE_NATIVE_WRAPPER_SEPOLIA,
    baseSepolia: import.meta.env.VITE_NATIVE_WRAPPER_BASE_SEPOLIA,
    arbitrumSepolia: import.meta.env.VITE_NATIVE_WRAPPER_ARBITRUM_SEPOLIA,
  };
  const fromEnv = map[networkId];
  if (typeof fromEnv === 'string' && fromEnv.startsWith('0x') && fromEnv.length === 42) {
    return fromEnv;
  }
  return undefined;
}

export function getNativeWrapperAddress(networkId: NetworkId): string {
  return envNativeWrapper(networkId) || NATIVE_WRAPPER_ADDRESSES[networkId] || ethers.ZeroAddress;
}

export function isNativeWrapperConfigured(networkId: NetworkId): boolean {
  return getNativeWrapperAddress(networkId) !== ethers.ZeroAddress;
}

/** Align wei amount to wrapper rate (dust refunded by contract on shieldNative). */
export function alignToWrapperRate(amountWei: bigint, rate: bigint): bigint {
  if (rate <= 0n) return amountWei;
  return (amountWei / rate) * rate;
}
