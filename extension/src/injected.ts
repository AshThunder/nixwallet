declare global {
  interface Window {
    ethereum?: NixEthereumProvider;
  }
}

type RpcCallback = (res: { result?: unknown; error?: string }) => void;
type EventListener = (...args: unknown[]) => void;

class NixEthereumProvider {
  private _reqId = 0;
  private _callbacks = new Map<number, RpcCallback>();
  private _eventListeners = new Map<string, EventListener[]>();

  isNixWallet = true;

  constructor() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.source !== 'nixwallet-content') return;
      
      const { id, result, error, method, params } = event.data;
      
      if (id !== undefined && this._callbacks.has(id)) {
        const cb = this._callbacks.get(id)!;
        this._callbacks.delete(id);
        cb({ result, error });
      } else if (method) {
        this._emit(method, params);
      }
    });
  }

  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
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
      }, window.location.origin);
    });
  }

  on(eventName: string, listener: EventListener) {
    if (!this._eventListeners.has(eventName)) {
      this._eventListeners.set(eventName, []);
    }
    this._eventListeners.get(eventName)!.push(listener);
    return this;
  }

  removeListener(eventName: string, listener: EventListener) {
    const listeners = this._eventListeners.get(eventName);
    if (listeners) {
      this._eventListeners.set(eventName, listeners.filter(l => l !== listener));
    }
    return this;
  }

  private _emit(eventName: string, ...args: unknown[]) {
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
