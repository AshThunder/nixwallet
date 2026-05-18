import { addActivity, patchActivity } from './activity';
import { decodeExternalTransaction } from './txDecode';
import type { NetworkLike } from './txDecode';

const RECEIPT_POLL_INTERVAL_MS = 2500;
const RECEIPT_POLL_MAX_ATTEMPTS = 90;

interface TxReceipt {
  status?: string | number;
  blockNumber?: string | number | null;
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

function isReceiptConfirmed(receipt: TxReceipt | null): boolean {
  if (!receipt?.blockNumber) return false;
  const { status } = receipt;
  if (status === undefined || status === null) return false;
  if (typeof status === 'number') return status === 1;
  return status === '0x1' || status === '1';
}

function isReceiptReverted(receipt: TxReceipt | null): boolean {
  if (!receipt?.blockNumber) return false;
  const { status } = receipt;
  if (typeof status === 'number') return status === 0;
  return status === '0x0' || status === '0';
}

async function pollTransactionReceipt(hash: string, rpc: string): Promise<TxReceipt | null> {
  for (let attempt = 0; attempt < RECEIPT_POLL_MAX_ATTEMPTS; attempt++) {
    const receipt = await rpcCall<TxReceipt | null>(rpc, 'eth_getTransactionReceipt', [hash]);
    if (receipt?.blockNumber && (isReceiptConfirmed(receipt) || isReceiptReverted(receipt))) {
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS));
  }
  return null;
}

async function trackTransactionConfirmation(input: {
  hash: string;
  network: NetworkLike;
  address: string;
  source: 'dapp' | 'walletconnect';
}) {
  try {
    const receipt = await pollTransactionReceipt(input.hash, input.network.rpc);
    if (!receipt) {
      await patchActivity(input.hash, {
        status: 'pending',
        txStage: `${input.source}-confirmation-timeout`,
      });
      return;
    }

    await patchActivity(input.hash, {
      status: isReceiptConfirmed(receipt) ? 'success' : 'error',
      txStage: isReceiptConfirmed(receipt) ? `${input.source}-confirmed` : `${input.source}-reverted`,
    });
  } catch {
    await patchActivity(input.hash, {
      status: 'pending',
      txStage: `${input.source}-confirmation-error`,
    }).catch(() => {});
  }
}

export async function recordExternalTransaction(input: {
  hash: string;
  tx: Record<string, unknown>;
  network: NetworkLike & { chainId: number };
  address: string;
  source: 'dapp' | 'walletconnect';
  requestId?: string;
  origin?: string;
}) {
  // Write a pending row immediately so UI never shows success before confirmation.
  await addActivity({
    id: input.hash,
    type: 'send',
    amount: 'Transaction submitted',
    status: 'pending',
    networkId: input.network.id,
    address: input.address,
    hash: input.hash,
    isConfidential: false,
    chainId: input.network.chainId,
    txStage: `${input.source}-submitted`,
    requestId: input.requestId || input.origin,
  });

  try {
    const decoded = await decodeExternalTransaction(input.tx, input.network);
    await patchActivity(input.hash, {
      type: decoded.type,
      amount: decoded.amount,
      isConfidential: decoded.isConfidential,
      recipient: decoded.recipient,
      tokenSymbol: decoded.tokenSymbol,
      tokenAddress: decoded.tokenAddress,
      txStage: decoded.txStage || `${input.source}-submitted`,
    });
  } catch {
    // Keep the pending row even if decoding fails.
  }

  void trackTransactionConfirmation({
    hash: input.hash,
    network: input.network,
    address: input.address,
    source: input.source,
  });
}
