import type { DappNetwork } from './networks';

export interface DefaultToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export const DEFAULT_TOKENS_BY_NETWORK: Record<DappNetwork['id'], DefaultToken[]> = {
  sepolia: [
    {
      symbol: 'USDT',
      name: 'Tether USD',
      address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
      decimals: 6,
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      decimals: 6,
    },
  ],
  baseSepolia: [],
  arbitrumSepolia: [],
};

export function getDefaultTokens(network: DappNetwork | null): DefaultToken[] {
  if (!network) return [];
  return DEFAULT_TOKENS_BY_NETWORK[network.id];
}
