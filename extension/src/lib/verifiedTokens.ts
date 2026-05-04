export interface VerifiedTokenMeta {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  coingeckoId: string;
  min24hVolumeUsd: number;
}

export const VERIFIED_TOKENS: Record<string, VerifiedTokenMeta[]> = {
  sepolia: [
    {
      address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      coingeckoId: 'tether',
      min24hVolumeUsd: 500000,
    },
    {
      address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      coingeckoId: 'usd-coin',
      min24hVolumeUsd: 500000,
    },
  ],
  baseSepolia: [],
  arbitrumSepolia: [],
};

export function getVerifiedTokenMeta(networkId: string, address: string): VerifiedTokenMeta | null {
  const tokens = VERIFIED_TOKENS[networkId] || [];
  const match = tokens.find((t) => t.address.toLowerCase() === address.toLowerCase());
  return match || null;
}

export function isAllowlistedToken(networkId: string, address: string): boolean {
  return !!getVerifiedTokenMeta(networkId, address);
}
