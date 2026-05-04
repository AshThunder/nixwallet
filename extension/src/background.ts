import { ethers } from 'ethers';
import { getActiveNetwork, getAccountByIndex, getNetworkByChainId, getSigner, loadNetwork, setActiveNetwork } from './lib/wallet';
import {
  getDappPermission,
  listDappPermissions,
  revokeDappPermission,
  touchDappPermission,
  upsertDappPermission,
} from './lib/dappPermissions';
import { addActivity } from './lib/activity';

// Background service worker for the NixWallet extension

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Track internal lock state
let isUnlocked = false;
let lastActivity = Date.now();
let autoLockTimer: ReturnType<typeof setInterval> | null = null;

const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const PROVIDER_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingProviderRequest {
  key: string;
  id?: number;
  method: string;
  origin: string;
  params?: unknown[];
  createdAt: number;
  chainId: number;
}

const SENSITIVE_PROVIDER_METHODS = new Set([
  'eth_requestAccounts',
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
  'wallet_switchEthereumChain',
]);

interface SessionVaultLike {
  mnemonic: string;
  privateKey: string;
  importedAccounts?: { address: string; privateKey: string }[];
}

const pendingProviderRequests = new Map<string, PendingProviderRequest>();
const providerApprovalWaiters = new Map<string, (approved: boolean) => void>();

function startAutoLockTimer() {
  if (autoLockTimer) clearInterval(autoLockTimer);
  autoLockTimer = setInterval(async () => {
    if (!isUnlocked) return;

    const settings = (await chrome.storage.local.get(['autoLockTimeout'])) as { autoLockTimeout?: number };
    const timeout = settings.autoLockTimeout || DEFAULT_TIMEOUT;

    if (Date.now() - lastActivity > timeout) {
      
      isUnlocked = false;
      // Broadcast lock event to all tabs/popup
      chrome.runtime.sendMessage({ type: 'VAULT_LOCKED' }).catch(() => {});
    }
  }, 30000); // Check every 30s
}

chrome.runtime.onInstalled.addListener(() => {
  loadNetwork().catch(() => {});
  startAutoLockTimer();
});

chrome.runtime.onStartup.addListener(() => {
  loadNetwork().catch(() => {});
});

// Listener for messages from Popup and Content Scripts
chrome.runtime.onMessage.addListener((message: { type?: string; payload?: Record<string, unknown>; origin?: string }, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  lastActivity = Date.now();
  
  if (message.type === 'VAULT_UNLOCKED') {
    isUnlocked = true;
    startAutoLockTimer();
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'VAULT_LOCKED') {
    isUnlocked = false;
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'GET_LOCK_STATE') {
    sendResponse({ isUnlocked });
    return true;
  }

  if (message.type === 'KEEP_ALIVE') {
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === 'NETWORK_CHANGED' && message.payload) {
    const chainId = (message.payload as { chainId?: number }).chainId;
    if (typeof chainId === 'number') {
      broadcastProviderEvent('chainChanged', `0x${chainId.toString(16)}`)
        .then(() => sendResponse({ ok: true }))
        .catch((error: Error) => sendResponse({ error: error.message }));
      return true;
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'RPC_REQUEST' && message.payload) {
    const payload = message.payload as { id?: number; method: string; params?: unknown[]; origin?: string };
    if (SENSITIVE_PROVIDER_METHODS.has(payload.method)) {
      void openApprovalUi(sender);
    }
    handleRpcRequest(payload)
      .then(result => sendResponse({ result }))
      .catch((error: Error) => sendResponse({ error: error.message }));
    return true; 
  }
  if (message.type === 'LIST_PENDING_PROVIDER_REQUESTS') {
    sendResponse({ items: Array.from(pendingProviderRequests.values()) });
    return true;
  }
  if (message.type === 'APPROVE_PROVIDER_REQUEST' && message.payload?.key) {
    approveProviderRequest(String(message.payload.key))
      .then((response) => sendResponse(response))
      .catch((error: Error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === 'REJECT_PROVIDER_REQUEST' && message.payload?.key) {
    resolveProviderApproval(String(message.payload.key), false)
      .then(() => sendResponse({ ok: true }))
      .catch((error: Error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === 'REJECT_ALL_PROVIDER_REQUESTS') {
    rejectAllProviderApprovals()
      .then(() => sendResponse({ ok: true }))
      .catch((error: Error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === 'LIST_DAPP_PERMISSIONS') {
    listDappPermissions()
      .then((items) => sendResponse({ items }))
      .catch((error: Error) => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === 'REVOKE_DAPP_PERMISSION' && message.origin) {
    revokeDappPermission(message.origin)
      .then(async () => {
        await broadcastProviderEvent('accountsChanged', []);
        sendResponse({ ok: true });
      })
      .catch((error: Error) => sendResponse({ error: error.message }));
    return true;
  }

  return false;
});

async function requestProviderApproval(input: PendingProviderRequest): Promise<boolean> {
  pendingProviderRequests.set(input.key, input);
  await broadcastProviderApprovalsUpdated();
  return new Promise((resolve) => {
    providerApprovalWaiters.set(input.key, resolve);
    setTimeout(async () => {
      if (!providerApprovalWaiters.has(input.key)) return;
      providerApprovalWaiters.delete(input.key);
      pendingProviderRequests.delete(input.key);
      await broadcastProviderApprovalsUpdated();
      resolve(false);
    }, PROVIDER_APPROVAL_TIMEOUT_MS);
  });
}

async function openApprovalUi(sender: chrome.runtime.MessageSender) {
  if (typeof sender.tab?.id === 'number') {
    try {
      await chrome.sidePanel.open({ tabId: sender.tab.id });
      return;
    } catch {
      // Chrome may refuse side panel opens outside supported user-activation contexts.
    }
  }

  if (typeof sender.tab?.windowId === 'number') {
    try {
      await chrome.sidePanel.open({ windowId: sender.tab.windowId });
    } catch {
      // If both side panel open attempts fail, keep the queued request visible in NixWallet.
    }
  }
}

async function resolveProviderApproval(key: string, approved: boolean) {
  const waiter = providerApprovalWaiters.get(key);
  providerApprovalWaiters.delete(key);
  pendingProviderRequests.delete(key);
  await broadcastProviderApprovalsUpdated();
  if (waiter) waiter(approved);
}

async function approveProviderRequest(key: string) {
  if (!(await hasUnlockedVaultSession())) {
    return { error: 'Unlock NixWallet before approving this request.' };
  }
  await resolveProviderApproval(key, true);
  return { ok: true };
}

async function hasUnlockedVaultSession(): Promise<boolean> {
  if (isUnlocked) return true;
  const session = await chrome.storage.session.get('nixwallet_session');
  const cached = session.nixwallet_session as SessionVaultLike | undefined;
  if (cached?.mnemonic && cached.privateKey) {
    isUnlocked = true;
    startAutoLockTimer();
    return true;
  }
  return false;
}

async function rejectAllProviderApprovals() {
  const keys = Array.from(pendingProviderRequests.keys());
  keys.forEach((key) => {
    const waiter = providerApprovalWaiters.get(key);
    providerApprovalWaiters.delete(key);
    pendingProviderRequests.delete(key);
    if (waiter) waiter(false);
  });
  await broadcastProviderApprovalsUpdated();
}

async function broadcastProviderApprovalsUpdated() {
  await chrome.runtime.sendMessage({ type: 'PROVIDER_APPROVALS_UPDATED' }).catch(() => {});
}

async function getUnlockedPrivateKeyForActiveAccount(): Promise<string> {
  const [local, session] = await Promise.all([
    chrome.storage.local.get(['activeAccountType', 'activeAddress', 'activeAccountIndex']),
    chrome.storage.session.get('nixwallet_session'),
  ]);

  const cached = session.nixwallet_session as SessionVaultLike | undefined;
  if (!cached) {
    throw new Error('Wallet is locked. Unlock NixWallet to approve this request.');
  }

  const activeType = local.activeAccountType === 'imported' ? 'imported' : 'hd';
  const activeAddress = typeof local.activeAddress === 'string' ? local.activeAddress.toLowerCase() : '';
  if (activeType === 'imported' && activeAddress) {
    const imported = (cached.importedAccounts || []).find((a) => a.address.toLowerCase() === activeAddress);
    if (imported?.privateKey) return imported.privateKey;
  }
  const idx = Number.isFinite(Number(local.activeAccountIndex)) ? Number(local.activeAccountIndex) : 0;
  return getAccountByIndex(cached.mnemonic, idx).privateKey;
}

async function getActiveProviderAccount(): Promise<string> {
  const [local, session] = await Promise.all([
    chrome.storage.local.get(['activeAccountType', 'activeAddress', 'activeAccountIndex']),
    chrome.storage.session.get('nixwallet_session'),
  ]);

  if (typeof local.activeAddress === 'string' && ethers.isAddress(local.activeAddress)) {
    return local.activeAddress;
  }

  const cached = session.nixwallet_session as SessionVaultLike | undefined;
  if (!cached) {
    throw new Error('Wallet is locked. Unlock NixWallet to connect this site.');
  }

  const activeType = local.activeAccountType === 'imported' ? 'imported' : 'hd';
  if (activeType === 'imported' && cached.importedAccounts?.[0]?.address) {
    return cached.importedAccounts[0].address;
  }

  const idx = Number.isFinite(Number(local.activeAccountIndex)) ? Number(local.activeAccountIndex) : 0;
  return getAccountByIndex(cached.mnemonic, idx).address;
}

async function handleSensitiveRpcRequest(method: string, params: unknown[] | undefined, origin: string) {
  const permission = await getDappPermission(origin);
  if (!permission && method !== 'eth_requestAccounts') {
    throw new Error('Origin not connected. Call eth_requestAccounts first.');
  }

  const network = getActiveNetwork();
  switch (method) {
    case 'eth_requestAccounts': {
      const accounts = [await getActiveProviderAccount()];
      await upsertDappPermission(origin, accounts, network.chainId);
      await broadcastProviderEvent('accountsChanged', accounts);
      return accounts;
    }
    case 'personal_sign': {
      const [message, address] = (params || []) as [string, string];
      const signer = getSigner(await getUnlockedPrivateKeyForActiveAccount());
      if (address?.toLowerCase() !== signer.address.toLowerCase()) throw new Error('Address mismatch for personal_sign');
      await touchDappPermission(origin, network.chainId);
      return signer.signMessage(ethers.getBytes(message));
    }
    case 'eth_sign': {
      const [address, message] = (params || []) as [string, string];
      const signer = getSigner(await getUnlockedPrivateKeyForActiveAccount());
      if (address?.toLowerCase() !== signer.address.toLowerCase()) throw new Error('Address mismatch for eth_sign');
      await touchDappPermission(origin, network.chainId);
      return signer.signMessage(ethers.getBytes(message));
    }
    case 'eth_signTypedData':
    case 'eth_signTypedData_v3':
    case 'eth_signTypedData_v4': {
      const [address, typedDataRaw] = (params || []) as [string, string | Record<string, unknown>];
      const signer = getSigner(await getUnlockedPrivateKeyForActiveAccount());
      if (address?.toLowerCase() !== signer.address.toLowerCase()) throw new Error('Address mismatch for typed data');
      const typedData = typeof typedDataRaw === 'string' ? JSON.parse(typedDataRaw) : typedDataRaw;
      const { domain, types, message } = typedData;
      delete types.EIP712Domain;
      await touchDappPermission(origin, network.chainId);
      return signer.signTypedData(domain, types, message);
    }
    case 'eth_sendTransaction': {
      const [tx] = (params || []) as [Record<string, unknown>];
      const signer = getSigner(await getUnlockedPrivateKeyForActiveAccount());
      const from = typeof tx.from === 'string' ? tx.from.toLowerCase() : signer.address.toLowerCase();
      if (from !== signer.address.toLowerCase()) throw new Error('Transaction from does not match active account');
      const sent = await signer.sendTransaction({
        to: tx.to as string,
        data: tx.data as string | undefined,
        value: tx.value ? BigInt(tx.value as string) : undefined,
        gasLimit: tx.gas ? BigInt(tx.gas as string) : undefined,
        maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas as string) : undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas as string) : undefined,
        nonce: typeof tx.nonce === 'string' ? Number(tx.nonce) : undefined,
      });
      await touchDappPermission(origin, network.chainId);
      await addActivity({
        id: sent.hash,
        type: 'send',
        amount: tx.value ? `${ethers.formatEther(BigInt(tx.value as string))} ${network.symbol}` : 'External transaction',
        status: 'success',
        networkId: network.id,
        address: signer.address,
        hash: sent.hash,
        isConfidential: false,
        recipient: typeof tx.to === 'string' ? tx.to : undefined,
        chainId: network.chainId,
        txStage: 'dapp-submitted',
        requestId: origin,
      });
      return sent.hash;
    }
    case 'wallet_switchEthereumChain': {
      const requested = (params?.[0] as { chainId?: string } | undefined)?.chainId;
      if (!requested) throw new Error('wallet_switchEthereumChain requires chainId');
      const parsed = Number.parseInt(requested, 16);
      if (!Number.isFinite(parsed)) throw new Error('Invalid chainId');
      const target = getNetworkByChainId(parsed);
      if (!target) throw new Error(`Unsupported chainId ${requested} in NixWallet`);

      setActiveNetwork(target.id);
      await upsertDappPermission(origin, (await getDappPermission(origin))?.accounts || [], target.chainId);
      await broadcastProviderEvent('chainChanged', `0x${target.chainId.toString(16)}`);
      return null;
    }
    default:
      throw new Error(`Unsupported sensitive method ${method}`);
  }
}

async function handleRpcRequest(payload: { id?: number; method: string; params?: unknown[]; origin?: string }) {
  await loadNetwork();
  const { method, params } = payload;
  const network = getActiveNetwork();
  const origin = payload.origin;

  if (!origin) {
    throw new Error('Missing dApp origin for provider request');
  }

  if (SENSITIVE_PROVIDER_METHODS.has(method)) {
    const key = `${origin}:${method}:${payload.id ?? Date.now()}:${Date.now()}`;
    const approved = await requestProviderApproval({
      key,
      id: payload.id,
      method,
      origin,
      params,
      createdAt: Date.now(),
      chainId: network.chainId,
    });
    if (!approved) throw new Error('User rejected request');
    return handleSensitiveRpcRequest(method, params, origin);
  }

  // 1. Handle non-sensitive provider methods
  switch (method) {
    case 'eth_accounts': {
      const permission = await getDappPermission(origin);
      if (!permission) return [];
      await touchDappPermission(origin, network.chainId);
      return permission.accounts;
    }

    case 'eth_chainId':
      return `0x${network.chainId.toString(16)}`;

    case 'net_version':
      return String(network.chainId);

    case 'wallet_addEthereumChain': {
      const requested = (params?.[0] as { chainId?: string } | undefined)?.chainId;
      if (!requested) throw new Error('wallet_addEthereumChain requires chainId');
      const parsed = Number.parseInt(requested, 16);
      const target = Number.isFinite(parsed) ? getNetworkByChainId(parsed) : null;
      if (!target) {
        throw new Error(`Requested chain ${requested} is not supported by NixWallet`);
      }
      return null;
    }

    case 'eth_blockNumber':
    case 'eth_getBalance':
    case 'eth_gasPrice':
    case 'eth_maxPriorityFeePerGas':
    case 'eth_feeHistory':
    case 'eth_getCode':
    case 'eth_getTransactionCount':
    case 'eth_getTransactionByHash':
    case 'eth_getTransactionReceipt':
    case 'eth_getBlockByHash':
    case 'eth_getBlockByNumber':
    case 'eth_call':
    case 'eth_estimateGas': {
      // Proxy to the actual RPC
      const response = await fetch(network.rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: payload.id || 1,
          jsonrpc: '2.0',
          method,
          params: params || []
        })
      });
      if (!response.ok) throw new Error(`RPC request failed: HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      await touchDappPermission(origin, network.chainId);
      return data.result;
    }

    default:
      throw new Error(`Method ${method} not implemented in NixWallet background`);
  }
}

async function broadcastProviderEvent(method: string, params: unknown) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((t) => typeof t.id === 'number')
      .map((tab) => chrome.tabs.sendMessage(tab.id!, { type: 'PROVIDER_EVENT', method, params }).catch(() => {}))
  );
}

