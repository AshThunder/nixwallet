import { ZeroAddress } from 'ethers';
import type { DappNetwork } from './networks';

/** Matches extension `nativeToken.ts` deployed wrappers. */
export const NATIVE_WRAPPER_ADDRESSES: Partial<Record<DappNetwork['id'], string>> = {
  sepolia: '0x55Ee31F5706D91e0E48C48B5dBc6e14aD7afA3d2',
  baseSepolia: '0xCC5935e2D653a8e32151e8cB342795485BEbdF50',
  arbitrumSepolia: '0x9323c32a9759A5F5dF4340e8309Fb639da8c5a29',
};

export const CETH_DECIMALS = 6;
export const ETH_DECIMALS = 18;

export function getNativeWrapperAddress(networkId: DappNetwork['id']): string {
  return NATIVE_WRAPPER_ADDRESSES[networkId] ?? ZeroAddress;
}

export function isNativeWrapperConfigured(networkId: DappNetwork['id']): boolean {
  return getNativeWrapperAddress(networkId) !== ZeroAddress;
}

export const NATIVE_TOKEN_METADATA = {
  address: 'native',
  symbol: 'ETH',
  name: 'Ether',
  decimals: ETH_DECIMALS,
} as const;

export function isNativeTokenAddress(address: string): boolean {
  return address === 'native' || address.toLowerCase() === ZeroAddress.toLowerCase();
}
