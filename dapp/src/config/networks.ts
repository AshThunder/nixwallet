export interface DappNetwork {
  id: 'sepolia' | 'baseSepolia' | 'arbitrumSepolia';
  chainId: number;
  chainHex: `0x${string}`;
  name: string;
  rpc: string;
  explorer: string;
  registryAddress: string;
}

const REGISTRY_FALLBACKS: Record<DappNetwork['id'], string> = {
  sepolia: '0xEE098B005e1B979Ca32ac427c367C343879e502C',
  baseSepolia: '0xfD4223809FE333FC23468F76bB38BE4169853761',
  arbitrumSepolia: '0xe572ED5b27b44641Da441cE479643B30CF200E9c',
};

export const SUPPORTED_NETWORKS: DappNetwork[] = [
  {
    id: 'sepolia',
    chainId: 11155111,
    chainHex: '0xaa36a7',
    name: 'Ethereum Sepolia',
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
    registryAddress: import.meta.env.VITE_REGISTRY_SEPOLIA || REGISTRY_FALLBACKS.sepolia,
  },
  {
    id: 'baseSepolia',
    chainId: 84532,
    chainHex: '0x14a34',
    name: 'Base Sepolia',
    rpc: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    registryAddress: import.meta.env.VITE_REGISTRY_BASE_SEPOLIA || REGISTRY_FALLBACKS.baseSepolia,
  },
  {
    id: 'arbitrumSepolia',
    chainId: 421614,
    chainHex: '0x66eee',
    name: 'Arbitrum Sepolia',
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorer: 'https://sepolia.arbiscan.io',
    registryAddress: import.meta.env.VITE_REGISTRY_ARB_SEPOLIA || REGISTRY_FALLBACKS.arbitrumSepolia,
  },
];

export function getNetworkByChainId(chainId: number | null): DappNetwork | null {
  if (!chainId) return null;
  return SUPPORTED_NETWORKS.find((network) => network.chainId === chainId) || null;
}

export function parseChainId(hex: string | null): number | null {
  if (!hex) return null;
  const parsed = Number.parseInt(hex, 16);
  return Number.isFinite(parsed) ? parsed : null;
}
