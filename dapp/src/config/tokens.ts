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
  baseSepolia: [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      decimals: 6,
    },
  ],
  arbitrumSepolia: [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
      decimals: 6,
    },
  ],
};

export function getDefaultTokens(network: DappNetwork | null): DefaultToken[] {
  if (!network) return [];
  return DEFAULT_TOKENS_BY_NETWORK[network.id];
}
