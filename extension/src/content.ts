// Content script for NixWallet

const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/injected.ts');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== 'nixwallet-injected') return;

  const { id, method, params } = event.data;
  
  chrome.runtime.sendMessage({ 
    type: 'RPC_REQUEST', 
    payload: { id, method, params } 
  }, (response) => {
    if (chrome.runtime.lastError) {
      window.postMessage({
        source: 'nixwallet-content',
        id,
        error: chrome.runtime.lastError.message ?? 'Extension runtime error'
      }, window.location.origin);
      return;
    }
    window.postMessage({
      source: 'nixwallet-content',
      id,
      result: response?.result,
      error: response?.error
    }, window.location.origin);
  });
});

chrome.runtime.onMessage.addListener((message: { type?: string; method?: string; params?: unknown }) => {
  if (message.type === 'PROVIDER_EVENT') {
    window.postMessage({
      source: 'nixwallet-content',
      method: message.method,
      params: message.params
    }, window.location.origin);
  }
});
