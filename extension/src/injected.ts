// Injected provider script for NixWallet
declare global {
  interface Window {
    ethereum?: any;
  }
}

class NixEthereumProvider {
  private _reqId = 0;
  private _callbacks = new Map<number, (res: any) => void>();
  private _eventListeners = new Map<string, Array<(...args: any[]) => void>>();

  isNixWallet = true;

  constructor() {
    // Listen for responses from content script
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.source !== 'nixwallet-content') return;
      
      const { id, result, error, method, params } = event.data;
      
      if (id !== undefined && this._callbacks.has(id)) {
        const cb = this._callbacks.get(id);
        this._callbacks.delete(id);
        cb!({ result, error });
      } else if (method) {
        // Event broadcast from background
        this._emit(method, params);
      }
    });

    console.log('NixWallet: EIP-1193 Provider Injected');
  }

  async request(args: { method: string; params?: any[] }) {
    return new Promise((resolve, reject) => {
      const id = ++this._reqId;
      this._callbacks.set(id, (res) => {
        if (res.error) reject(new Error(res.error));
        else resolve(res.result);
      });

      window.postMessage({
        source: 'nixwallet-injected',
        id,
        method: args.method,
        params: args.params
      }, '*');
    });
  }

  on(eventName: string, listener: (...args: any[]) => void) {
    if (!this._eventListeners.has(eventName)) {
      this._eventListeners.set(eventName, []);
    }
    this._eventListeners.get(eventName)!.push(listener);
    return this;
  }

  removeListener(eventName: string, listener: (...args: any[]) => void) {
    const listeners = this._eventListeners.get(eventName);
    if (listeners) {
      this._eventListeners.set(eventName, listeners.filter(l => l !== listener));
    }
    return this;
  }

  private _emit(eventName: string, ...args: any[]) {
    const listeners = this._eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach(l => l(...args));
    }
  }
}

if (!window.ethereum) {
  window.ethereum = new NixEthereumProvider();
  window.dispatchEvent(new Event('ethereum#initialized'));
}
