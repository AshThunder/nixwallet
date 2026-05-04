// Content script for NixWallet
const NIX_WALLET_BUILD = 'typed-data-v4-2026-05-02';
const NIX_WALLET_INJECTED_SOURCE = `nixwallet-injected:${NIX_WALLET_BUILD}`;
const NIX_WALLET_CONTENT_SOURCE = `nixwallet-content:${NIX_WALLET_BUILD}`;

const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/injected.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== NIX_WALLET_INJECTED_SOURCE) return;

  const { id, method, params } = event.data;
  const origin = window.location.origin;
  
  chrome.runtime.sendMessage({ 
    type: 'RPC_REQUEST', 
    payload: { id, method, params, origin } 
  }, (response) => {
    if (chrome.runtime.lastError) {
      window.postMessage({
        source: NIX_WALLET_CONTENT_SOURCE,
        build: NIX_WALLET_BUILD,
        id,
        error: chrome.runtime.lastError.message ?? 'Extension runtime error'
      }, window.location.origin);
      return;
    }
    window.postMessage({
      source: NIX_WALLET_CONTENT_SOURCE,
      build: NIX_WALLET_BUILD,
      id,
      result: response?.result,
      error: response?.error
    }, window.location.origin);
  });
});

chrome.runtime.onMessage.addListener((message: { type?: string; method?: string; params?: unknown }) => {
  if (message.type === 'PROVIDER_EVENT') {
    window.postMessage({
      source: NIX_WALLET_CONTENT_SOURCE,
      build: NIX_WALLET_BUILD,
      method: message.method,
      params: message.params
    }, window.location.origin);
  }
});
