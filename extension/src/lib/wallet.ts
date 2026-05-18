/**
 * Wallet — HD wallet generation and provider management
 */
import { ethers } from 'ethers';

/** Supported Fhenix host-chain testnets. */
export const FHENIX_NETWORKS = {
  sepolia: {
    id: 'sepolia',
    name: 'Sepolia',
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    chainId: 11155111,
    explorer: 'https://sepolia.etherscan.io',
    symbol: 'ETH',
  },
  baseSepolia: {
    id: 'baseSepolia',
    name: 'Base Sepolia',
    rpc: 'https://sepolia.base.org',
    chainId: 84532,
    explorer: 'https://sepolia.basescan.org',
    symbol: 'ETH',
  },
  arbitrumSepolia: {
    id: 'arbitrumSepolia',
    name: 'Arbitrum Sepolia',
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    chainId: 421614,
    explorer: 'https://sepolia.arbiscan.io',
    symbol: 'ETH',
  },
} as const;

export type NetworkId = keyof typeof FHENIX_NETWORKS;

let _activeNetwork: NetworkId = 'sepolia';

export function getActiveNetwork() {
  return FHENIX_NETWORKS[_activeNetwork];
}

export function setActiveNetwork(id: NetworkId) {
  _activeNetwork = id;
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ activeNetwork: id });
  }
}

export function getNetworkByChainId(chainId: number) {
  return (Object.values(FHENIX_NETWORKS)).find((n) => n.chainId === chainId) || null;
}

export async function loadNetwork(): Promise<NetworkId> {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    const result = await chrome.storage.local.get(['activeNetwork']);
    const id = result.activeNetwork as NetworkId | undefined;
    if (id && id in FHENIX_NETWORKS) {
      _activeNetwork = id;
    } else if (id && !(id in FHENIX_NETWORKS)) {
      _activeNetwork = 'sepolia';
      await chrome.storage.local.set({ activeNetwork: 'sepolia' });
    }
  }
  return _activeNetwork;
}

/** Create a new random HD wallet */
export function createNewWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic!.phrase,
  };
}

/** Restore wallet from mnemonic phrase */
export function restoreFromMnemonic(mnemonic: string) {
  const wallet = ethers.Wallet.fromPhrase(mnemonic);
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic!.phrase,
  };
}

/** Get a connected provider for the active network */
export function getProvider(): ethers.JsonRpcProvider {
  const network = getActiveNetwork();
  return new ethers.JsonRpcProvider(network.rpc, {
    chainId: network.chainId,
    name: network.name,
  });
}

/** Get a connected signer from private key */
export function getSigner(privateKey: string): ethers.Wallet {
  return new ethers.Wallet(privateKey, getProvider());
}

/** Get a signer by account index (HD Wallet) */
export function getAccountByIndex(mnemonic: string, index: number): { address: string, privateKey: string } {
  const path = `m/44'/60'/0'/0/${index}`;
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
}

/** Shorten address for display */
export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Format a token/native amount for UI (truncates fractional digits, trims trailing zeros). */
export function formatUnitsDisplay(
  amount: bigint,
  tokenDecimals: number,
  displayDecimals = 4,
): string {
  const formatted = ethers.formatUnits(amount, tokenDecimals);
  const [whole, frac = ''] = formatted.split('.');
  const trimmed = frac.slice(0, displayDecimals).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/** Format native ETH balance from wei */
export function formatBalance(wei: bigint, displayDecimals = 4): string {
  return formatUnitsDisplay(wei, 18, displayDecimals);
}
