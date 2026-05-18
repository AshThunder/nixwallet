import type { NetworkId } from './wallet';

const CIRCLE_FAUCET = 'https://faucet.circle.com/';

const FAUCETS: Partial<Record<NetworkId, { eth?: string; usdc?: string }>> = {
  sepolia: {
    eth: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
    usdc: CIRCLE_FAUCET,
  },
  baseSepolia: {
    usdc: CIRCLE_FAUCET,
  },
  arbitrumSepolia: {
    usdc: CIRCLE_FAUCET,
  },
};

export function getNativeEthFaucetUrl(networkId: NetworkId): string | undefined {
  return FAUCETS[networkId]?.eth;
}

export function getUsdcFaucetUrl(networkId: NetworkId): string | undefined {
  return FAUCETS[networkId]?.usdc;
}

export function getStablecoinFaucetUrl(networkId: NetworkId, symbol: string): string | undefined {
  if (symbol.trim().toUpperCase() === 'USDC') return getUsdcFaucetUrl(networkId);
  return undefined;
}
