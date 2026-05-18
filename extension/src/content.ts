// Content script for NixWallet
const NIX_WALLET_BUILD = 'typed-data-v4-2026-05-02';
const NIX_WALLET_INJECTED_SOURCE = `nixwallet-injected:${NIX_WALLET_BUILD}`;
const NIX_WALLET_CONTENT_SOURCE = `nixwallet-content:${NIX_WALLET_BUILD}`;
const EXTENSION_RELOADED_ERROR = 'NixWallet was reloaded. Refresh this page to reconnect the wallet.';

function isExtensionContextValid(): boolean {
  try {
    return typeof chrome.runtime?.id === 'string';
  } catch {
    return false;
  }
}

function isContextInvalidatedMessage(message?: string): boolean {
  return Boolean(message?.includes('Extension context invalidated'));
}

function replyToPage(id: number | undefined, payload: { result?: unknown; error?: string }) {
  window.postMessage({
    source: NIX_WALLET_CONTENT_SOURCE,
    build: NIX_WALLET_BUILD,
    id,
    ...payload,
  }, window.location.origin);
}

const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/injected.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== NIX_WALLET_INJECTED_SOURCE) return;

  const { id, method, params } = event.data;
  const origin = window.location.origin;

  if (!isExtensionContextValid()) {
    replyToPage(id, { error: EXTENSION_RELOADED_ERROR });
    return;
  }

  try {
    chrome.runtime.sendMessage({
      type: 'RPC_REQUEST',
      payload: { id, method, params, origin },
    }, (response) => {
      if (!isExtensionContextValid()) {
        replyToPage(id, { error: EXTENSION_RELOADED_ERROR });
        return;
      }

      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError.message ?? 'Extension runtime error';
        replyToPage(id, {
          error: isContextInvalidatedMessage(message) ? EXTENSION_RELOADED_ERROR : message,
        });
        return;
      }

      replyToPage(id, {
        result: response?.result,
        error: response?.error,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extension runtime error';
    replyToPage(id, {
      error: isContextInvalidatedMessage(message) ? EXTENSION_RELOADED_ERROR : message,
    });
  }
});

chrome.runtime.onMessage.addListener((message: { type?: string; method?: string; params?: unknown }) => {
  if (!isExtensionContextValid()) return;
  if (message.type === 'PROVIDER_EVENT') {
    window.postMessage({
      source: NIX_WALLET_CONTENT_SOURCE,
      build: NIX_WALLET_BUILD,
      method: message.method,
      params: message.params,
    }, window.location.origin);
  }
});
