import { getActiveNetwork } from './lib/wallet';

// Background service worker for the NixWallet extension
console.log('NixWallet background initialized');

// Track internal lock state
let isUnlocked = false;
let lastActivity = Date.now();
let autoLockTimer: ReturnType<typeof setInterval> | null = null;

const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

function startAutoLockTimer() {
  if (autoLockTimer) clearInterval(autoLockTimer);
  autoLockTimer = setInterval(async () => {
    if (!isUnlocked) return;

    const settings = (await chrome.storage.local.get(['autoLockTimeout'])) as { autoLockTimeout?: number };
    const timeout = settings.autoLockTimeout || DEFAULT_TIMEOUT;

    if (Date.now() - lastActivity > timeout) {
      console.log('Auto-locking NixWallet due to inactivity');
      isUnlocked = false;
      // Broadcast lock event to all tabs/popup
      chrome.runtime.sendMessage({ type: 'VAULT_LOCKED' }).catch(() => {});
    }
  }, 30000); // Check every 30s
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('NixWallet installed');
  startAutoLockTimer();
});

// Listener for messages from Popup and Content Scripts
chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
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

  if (message.type === 'RPC_REQUEST') {
    handleRpcRequest(message.payload)
      .then(result => sendResponse({ result }))
      .catch(error => sendResponse({ error: error.message }));
    return true; 
  }
  
  return true;
});

async function handleRpcRequest(payload: { id?: number; method: string; params?: any[] }) {
  const { method, params } = payload;
  const network = getActiveNetwork();

  // 1. Handle non-provider methods
  switch (method) {
    case 'eth_requestAccounts':
    case 'eth_accounts': {
      const result = await chrome.storage.local.get(['activeAddress']);
      return result.activeAddress ? [result.activeAddress] : [];
    }

    case 'eth_chainId':
      return `0x${network.chainId.toString(16)}`;

    case 'net_version':
      return String(network.chainId);

    case 'eth_blockNumber':
    case 'eth_getBalance':
    case 'eth_getCode':
    case 'eth_getTransactionCount':
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
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      return data.result;
    }

    default:
      throw new Error(`Method ${method} not implemented in NixWallet background`);
  }
}
