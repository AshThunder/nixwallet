/**
 * Discover ERC-20 tokens the wallet has interacted with / may hold (Sepolia).
 * Uses Etherscan token transfer index when available; always supplements with a
 * small curated probe list so common testnet tokens still surface without an API key.
 */

import { ethers } from 'ethers';
import type { TokenMetadata } from './tokens';

export interface DetectedToken extends TokenMetadata {
  balanceFormatted: string;
}

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
] as const;

/** Verified Sepolia ERC-20s to balance-probe when indexers are unavailable or as a supplement. */
const SEPOLIA_ERC20_PROBE: string[] = [
  '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', // USDT
  '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDC
  '0x779877A7B0D9E8603169DdbD7836e478b4624789', // LINK
  '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', // WETH
];

const TRANSFER_EVENT_TOPIC = ethers.id('Transfer(address,address,uint256)');

function parseTokenTxResult(data: { result?: unknown }): string[] | null {
  if (typeof data.result === 'string') {
    return null;
  }
  if (!Array.isArray(data.result)) {
    return null;
  }

  const set = new Set<string>();
  for (const row of data.result as { contractAddress?: string }[]) {
    const ca = row.contractAddress;
    if (ca && typeof ca === 'string') {
      try {
        set.add(ethers.getAddress(ca));
      } catch {
        /* invalid */
      }
    }
  }
  return [...set];
}

async function fetchTransferContractAddressesEtherscan(wallet: string): Promise<string[] | null> {
  const key =
    typeof import.meta.env !== 'undefined' && typeof import.meta.env.VITE_ETHERSCAN_API_KEY === 'string'
      ? import.meta.env.VITE_ETHERSCAN_API_KEY.trim()
      : '';

  const params = new URLSearchParams({
    module: 'account',
    action: 'tokentx',
    address: wallet,
    page: '1',
    offset: '500',
    sort: 'desc',
  });
  if (key) params.set('apikey', key);

  try {
    const res = await fetch(`https://api-sepolia.etherscan.io/api?${params.toString()}`);
    const data: { status?: string; message?: string; result?: unknown } = await res.json();
    return parseTokenTxResult(data);
  } catch {
    return null;
  }
}

/** Blockscout (Sepolia) — Etherscan-compatible `tokentx`, usually no API key. */
async function fetchTransferContractAddressesBlockscout(wallet: string): Promise<string[] | null> {
  const params = new URLSearchParams({
    module: 'account',
    action: 'tokentx',
    address: wallet,
    page: '1',
    offset: '500',
    sort: 'desc',
  });

  try {
    const res = await fetch(`https://eth-sepolia.blockscout.com/api?${params.toString()}`);
    const data: { result?: unknown } = await res.json();
    return parseTokenTxResult(data);
  } catch {
    return null;
  }
}

/**
 * Find ERC-20 contracts that sent the user tokens recently via `Transfer(..., to=user)` logs.
 * Works with any RPC; range is capped to avoid timeouts on free endpoints.
 */
async function fetchContractAddressesFromRecentInboundTransfers(
  provider: ethers.Provider,
  wallet: string,
  lookbackBlocks: number
): Promise<string[] | null> {
  const checksum = ethers.getAddress(wallet);
  const toTopic = ethers.zeroPadValue(checksum, 32);

  try {
    const head = await provider.getBlockNumber();
    const fromBlock = Math.max(0, head - lookbackBlocks);
    const filter = {
      fromBlock,
      toBlock: head,
      topics: [TRANSFER_EVENT_TOPIC, null, toTopic],
    };
    const logs = await provider.getLogs(filter);
    const set = new Set<string>();
    for (const log of logs) {
      try {
        set.add(ethers.getAddress(log.address));
      } catch {
        /* skip */
      }
    }
    return [...set];
  } catch {
    return null;
  }
}

/**
 * Returns ERC-20s with non-zero balance that are not already in `savedAddressesLower`.
 */
export async function discoverSepoliaWalletTokens(
  provider: ethers.Provider,
  walletAddress: string,
  savedAddressesLower: Set<string>
): Promise<{ tokens: DetectedToken[]; hint?: string }> {
  const wallet = ethers.getAddress(walletAddress);
  const candidates = new Set<string>();

  const [fromEtherscan, fromBlockscout] = await Promise.all([
    fetchTransferContractAddressesEtherscan(wallet),
    fetchTransferContractAddressesBlockscout(wallet),
  ]);

  let hint: string | undefined;

  if (fromEtherscan) fromEtherscan.forEach(a => candidates.add(a));
  if (fromBlockscout) fromBlockscout.forEach(a => candidates.add(a));

  const bothIndexersFailed = fromEtherscan === null && fromBlockscout === null;

  if (bothIndexersFailed) {
    let fromLogs = await fetchContractAddressesFromRecentInboundTransfers(provider, wallet, 35_000);
    if (!fromLogs?.length) {
      fromLogs = await fetchContractAddressesFromRecentInboundTransfers(provider, wallet, 12_000);
    }
    if (fromLogs?.length) {
      fromLogs.forEach(a => candidates.add(a));
      hint =
        'Explorer APIs were unavailable. Showing contracts from recent incoming transfers (limited block window) plus the built-in Sepolia list — add older tokens manually if needed.';
    } else {
      hint =
        'Could not load transfer history from explorers or the RPC log scan. Use the built-in list / manual contract add — a VITE_ETHERSCAN_API_KEY at build time helps.';
    }
  }

  for (const a of SEPOLIA_ERC20_PROBE) {
    try {
      candidates.add(ethers.getAddress(a));
    } catch {
      /* skip */
    }
  }

  const toCheck = [...candidates].filter(a => !savedAddressesLower.has(a.toLowerCase()));

  const tokens: DetectedToken[] = [];

  for (const addr of toCheck) {
    try {
      const c = new ethers.Contract(addr, ERC20_ABI, provider);
      const bal = await c.balanceOf(wallet);
      if (bal === 0n) continue;

      const [name, symbol, decimals] = await Promise.all([c.name(), c.symbol(), c.decimals()]);
      const decimalsNum = Number(decimals);

      tokens.push({
        address: addr,
        name: String(name),
        symbol: String(symbol),
        decimals: decimalsNum,
        balanceFormatted: ethers.formatUnits(bal, decimalsNum),
      });
    } catch {
      /* not a standard ERC-20 or RPC error */
    }
  }

  tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));

  return { tokens, hint };
}
