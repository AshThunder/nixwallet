// Content script for NixWallet
console.log('NixWallet: Content Script Active');

// 1. Inject the provider
const script = document.createElement('script');
script.src = chrome.runtime.getURL('src/injected.ts');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

// 2. Bridge messages between Page (Injected) and Background
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.source !== 'nixwallet-injected') return;

  const { id, method, params } = event.data;
  
  chrome.runtime.sendMessage({ 
    type: 'RPC_REQUEST', 
    payload: { id, method, params } 
  }, (response) => {
    // Send response back to injected script
    window.postMessage({
      source: 'nixwallet-content',
      id,
      result: response?.result,
      error: response?.error
    }, '*');
  });
});

// 3. Listen for events from Background (e.g. accountsChanged)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PROVIDER_EVENT') {
    window.postMessage({
      source: 'nixwallet-content',
      method: message.method,
      params: message.params
    }, '*');
  }
});
