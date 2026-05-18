import { ethers } from 'ethers';
import type { ActivityType } from './activity';
import { WRAPPER_ABI } from './contracts';
import { getNativeWrapperAddress } from './nativeToken';
import type { NetworkId } from './wallet';
import { getVerifiedTokenMeta } from './verifiedTokens';

const ERC20_INTERFACE = new ethers.Interface([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount)',
  'function transfer(address to, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
]);

const WRAPPER_INTERFACE = new ethers.Interface(WRAPPER_ABI);

export interface NetworkLike {
  id: NetworkId | string;
  rpc: string;
  symbol: string;
}

export interface DecodedExternalTx {
  type: ActivityType;
  amount: string;
  recipient?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  isConfidential: boolean;
  txStage: string;
}

async function rpcCall<T>(rpc: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC request failed: HTTP ${response.status}`);
  const data = await response.json() as { result?: T; error?: { message?: string } };
  if (data.error) throw new Error(data.error.message || 'RPC error');
  return data.result as T;
}

const tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

const WRAPPER_META_ABI = new ethers.Interface(['function symbol() view returns (string)']);

export async function fetchTokenMetadata(
  rpc: string,
  tokenAddress: string,
  networkId?: string,
): Promise<{ symbol: string; decimals: number } | null> {
  const key = tokenAddress.toLowerCase();
  const cached = tokenMetaCache.get(key);
  if (cached) return cached;

  if (networkId) {
    const verified = getVerifiedTokenMeta(networkId, tokenAddress);
    if (verified) {
      const meta = { symbol: verified.symbol, decimals: verified.decimals };
      tokenMetaCache.set(key, meta);
      return meta;
    }
  }

  try {
    const [symbolResult, decimalsResult] = await Promise.all([
      rpcCall<string>(rpc, 'eth_call', [{ to: tokenAddress, data: ERC20_INTERFACE.encodeFunctionData('symbol', []) }, 'latest']),
      rpcCall<string>(rpc, 'eth_call', [{ to: tokenAddress, data: ERC20_INTERFACE.encodeFunctionData('decimals', []) }, 'latest']),
    ]);
    const symbol = ERC20_INTERFACE.decodeFunctionResult('symbol', symbolResult)[0] as string;
    const decimals = Number(ERC20_INTERFACE.decodeFunctionResult('decimals', decimalsResult)[0]);
    const meta = { symbol, decimals: Number.isFinite(decimals) ? decimals : 18 };
    tokenMetaCache.set(key, meta);
    return meta;
  } catch {
    return null;
  }
}

function formatTokenAmount(amount: bigint, decimals: number, symbol: string) {
  return `${ethers.formatUnits(amount, decimals)} ${symbol}`;
}

function formatNativeValue(value: bigint, symbol: string) {
  return `${ethers.formatEther(value)} ${symbol}`;
}

function unlimitedApproval(amount: bigint) {
  return amount > 2n ** 200n;
}

async function fetchWrapperSymbol(rpc: string, wrapperAddress: string): Promise<string | null> {
  try {
    const data = WRAPPER_META_ABI.encodeFunctionData('symbol', []);
    const result = await rpcCall<string>(rpc, 'eth_call', [{ to: wrapperAddress, data }, 'latest']);
    return WRAPPER_META_ABI.decodeFunctionResult('symbol', result)[0] as string;
  } catch {
    return null;
  }
}

function isNativeWrapperAddress(networkId: string, address: string): boolean {
  const configured = getNativeWrapperAddress(networkId as NetworkId);
  if (configured === ethers.ZeroAddress) return false;
  return configured.toLowerCase() === address.toLowerCase();
}

export async function decodeExternalTransaction(
  tx: Record<string, unknown>,
  network: NetworkLike,
): Promise<DecodedExternalTx> {
  const to = typeof tx.to === 'string' ? tx.to : undefined;
  const data = typeof tx.data === 'string' ? tx.data : '0x';
  const value = tx.value ? BigInt(String(tx.value)) : 0n;

  if ((!data || data === '0x') && value > 0n) {
    return {
      type: 'send',
      amount: formatNativeValue(value, network.symbol),
      recipient: to,
      isConfidential: false,
      txStage: 'native-transfer',
    };
  }

  if (to && data && data !== '0x') {
    try {
      const parsed = ERC20_INTERFACE.parseTransaction({ data });
      const meta = await fetchTokenMetadata(network.rpc, to, network.id);
      const symbol = meta?.symbol || 'TOKEN';
      const decimals = meta?.decimals ?? 18;

      if (parsed?.name === 'transfer') {
        const recipient = String(parsed.args[0]);
        const amount = parsed.args[1] as bigint;
        return {
          type: 'send',
          amount: formatTokenAmount(amount, decimals, symbol),
          recipient,
          tokenAddress: to,
          tokenSymbol: symbol,
          isConfidential: false,
          txStage: 'erc20-transfer',
        };
      }

      if (parsed?.name === 'approve') {
        const amount = parsed.args[1] as bigint;
        return {
          type: 'send',
          amount: unlimitedApproval(amount)
            ? `Unlimited ${symbol} approval`
            : `Approve ${formatTokenAmount(amount, decimals, symbol)}`,
          recipient: String(parsed.args[0]),
          tokenAddress: to,
          tokenSymbol: symbol,
          isConfidential: false,
          txStage: 'erc20-approve',
        };
      }

      if (parsed?.name === 'transferFrom') {
        const amount = parsed.args[2] as bigint;
        return {
          type: 'send',
          amount: formatTokenAmount(amount, decimals, symbol),
          recipient: String(parsed.args[1]),
          tokenAddress: to,
          tokenSymbol: symbol,
          isConfidential: false,
          txStage: 'erc20-transferFrom',
        };
      }
    } catch {
      // Fall through to wrapper decoding.
    }

    try {
      const parsed = WRAPPER_INTERFACE.parseTransaction({ data });
      if (parsed?.name === 'shield') {
        const amount = parsed.args[1] as bigint;
        const cSymbol = (await fetchWrapperSymbol(network.rpc, to)) ?? 'cTOKEN';
        return {
          type: 'wrap',
          amount: `${ethers.formatUnits(amount, 6)} ${cSymbol}`,
          recipient: String(parsed.args[0]),
          tokenAddress: to,
          tokenSymbol: cSymbol,
          isConfidential: true,
          txStage: 'shield-submitted',
        };
      }
      if (parsed?.name === 'shieldNative') {
        return {
          type: 'wrap',
          amount: value > 0n ? `${ethers.formatEther(value)} ETH → cETH` : 'Shield native ETH',
          recipient: String(parsed.args[0]),
          tokenAddress: to,
          tokenSymbol: 'cETH',
          isConfidential: true,
          txStage: 'shield-native-submitted',
        };
      }
      if (parsed?.name === 'shieldWrappedNative') {
        const amount = parsed.args[1] as bigint;
        return {
          type: 'wrap',
          amount: `${ethers.formatEther(amount)} WETH → cETH`,
          recipient: String(parsed.args[0]),
          tokenAddress: to,
          tokenSymbol: 'cETH',
          isConfidential: true,
          txStage: 'shield-wrapped-native-submitted',
        };
      }
      if (parsed?.name === 'unshield') {
        const amount = parsed.args[2] as bigint;
        const cSymbol = isNativeWrapperAddress(network.id, to)
          ? 'cETH'
          : ((await fetchWrapperSymbol(network.rpc, to)) ?? 'cTOKEN');
        return {
          type: 'unwrap',
          amount: `${ethers.formatUnits(amount, 6)} ${cSymbol}`,
          recipient: String(parsed.args[1]),
          tokenAddress: to,
          tokenSymbol: cSymbol,
          isConfidential: true,
          txStage: 'unshield-requested',
        };
      }
      if (parsed?.name === 'claimUnshielded') {
        const cSymbol = isNativeWrapperAddress(network.id, to)
          ? 'cETH'
          : ((await fetchWrapperSymbol(network.rpc, to)) ?? 'cTOKEN');
        return {
          type: 'unwrap',
          amount: 'Claim unwrapped tokens',
          tokenAddress: to,
          tokenSymbol: cSymbol,
          isConfidential: true,
          txStage: 'claim-submitted',
        };
      }
      if (parsed?.name === 'claimUnshieldedBatch') {
        const count = Array.isArray(parsed.args[0]) ? parsed.args[0].length : 0;
        const cSymbol = isNativeWrapperAddress(network.id, to)
          ? 'cETH'
          : ((await fetchWrapperSymbol(network.rpc, to)) ?? 'cTOKEN');
        return {
          type: 'unwrap',
          amount: `Claim ${count} unwrap request${count === 1 ? '' : 's'}`,
          tokenAddress: to,
          tokenSymbol: cSymbol,
          isConfidential: true,
          txStage: 'claim-batch-submitted',
        };
      }
      if (parsed?.name === 'confidentialTransfer') {
        const cSymbol = isNativeWrapperAddress(network.id, to)
          ? 'cETH'
          : ((await fetchWrapperSymbol(network.rpc, to)) ?? 'cTOKEN');
        return {
          type: 'confidential-transfer',
          amount: 'Confidential transfer',
          recipient: String(parsed.args[0]),
          tokenAddress: to,
          tokenSymbol: cSymbol,
          isConfidential: true,
          txStage: 'confidential-transfer-submitted',
        };
      }
    } catch {
      // Unknown contract call.
    }
  }

  if (value > 0n) {
    return {
      type: 'send',
      amount: formatNativeValue(value, network.symbol),
      recipient: to,
      isConfidential: false,
      txStage: 'contract-call-with-value',
    };
  }

  return {
    type: 'send',
    amount: 'Contract interaction',
    recipient: to,
    isConfidential: false,
    txStage: 'contract-call',
  };
}
