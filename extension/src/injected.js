const NIX_EIP6963_INFO = {
  uuid: '8db7c1f0-64bb-4e7c-b816-29a89f4d6b45-dev-typed-data',
  name: 'NixWallet',
  icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="%230ad9dc"/><path d="M40 24h12v52l28-52h12v80H80V52l-28 52H40z" fill="%23060b1a"/></svg>',
  rdns: 'com.nixwallet.extension',
};

const NIX_WALLET_BUILD = 'typed-data-v4-2026-05-02';
const NIX_WALLET_INJECTED_SOURCE = `nixwallet-injected:${NIX_WALLET_BUILD}`;
const NIX_WALLET_CONTENT_SOURCE = `nixwallet-content:${NIX_WALLET_BUILD}`;

class NixEthereumProvider {
  constructor() {
    this._reqId = 0;
    this._callbacks = new Map();
    this._eventListeners = new Map();
    this.isNixWallet = true;
    this.isMetaMask = false;
    this.nixWalletBuild = NIX_WALLET_BUILD;
    this.nixWalletSupportsTypedData = true;

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.source !== NIX_WALLET_CONTENT_SOURCE) return;

      const { id, result, error, method, params } = event.data;

      if (id !== undefined && this._callbacks.has(id)) {
        const cb = this._callbacks.get(id);
        this._callbacks.delete(id);
        cb({ result, error });
      } else if (method) {
        this._emit(method, params);
      }
    });
  }

  request(args) {
    return new Promise((resolve, reject) => {
      const id = ++this._reqId;
      this._callbacks.set(id, (res) => {
        if (res.error) reject(new Error(res.error));
        else resolve(res.result);
      });

      window.postMessage(
        {
          source: NIX_WALLET_INJECTED_SOURCE,
          build: NIX_WALLET_BUILD,
          id,
          method: args.method,
          params: args.params,
        },
        window.location.origin,
      );
    });
  }

  on(eventName, listener) {
    if (!this._eventListeners.has(eventName)) {
      this._eventListeners.set(eventName, []);
    }
    this._eventListeners.get(eventName).push(listener);
    return this;
  }

  removeListener(eventName, listener) {
    const listeners = this._eventListeners.get(eventName);
    if (listeners) {
      this._eventListeners.set(
        eventName,
        listeners.filter((current) => current !== listener),
      );
    }
    return this;
  }

  _emit(eventName, ...args) {
    const listeners = this._eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach((listener) => listener(...args));
    }
  }
}

function announceProvider(provider) {
  window.dispatchEvent(
    new CustomEvent('eip6963:announceProvider', {
      detail: {
        info: NIX_EIP6963_INFO,
        provider,
      },
    }),
  );
}

function installProvider() {
  const provider = new NixEthereumProvider();

  if (!window.ethereum) {
    window.ethereum = provider;
    window.dispatchEvent(new Event('ethereum#initialized'));
  }

  announceProvider(provider);
  window.addEventListener('eip6963:requestProvider', () => announceProvider(provider));
}

installProvider();
