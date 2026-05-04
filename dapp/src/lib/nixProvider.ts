export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EthereumProvider {
  isNixWallet?: boolean;
  nixWalletBuild?: string;
  nixWalletSupportsTypedData?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (eventName: string, listener: (...args: unknown[]) => void) => unknown;
  removeListener?: (eventName: string, listener: (...args: unknown[]) => void) => unknown;
}

export interface DiscoveredProvider {
  info: Eip6963ProviderInfo;
  provider: EthereumProvider;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export async function discoverNixWallet(timeoutMs = 800): Promise<DiscoveredProvider | null> {
  const providers = new Map<string, DiscoveredProvider>();

  const handler = (event: Event) => {
    const custom = event as CustomEvent<DiscoveredProvider>;
    const detail = custom.detail;
    if (detail?.info?.uuid && detail.provider) {
      providers.set(detail.info.uuid, detail);
    }
  };

  window.addEventListener('eip6963:announceProvider', handler as EventListener);
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  await new Promise((resolve) => window.setTimeout(resolve, timeoutMs));
  window.removeEventListener('eip6963:announceProvider', handler as EventListener);

  const discovered = Array.from(providers.values());
  const markedCurrent = discovered.find(
    ({ info, provider }) => info.rdns === 'com.nixwallet.extension' && provider.nixWalletSupportsTypedData,
  );
  if (markedCurrent) return markedCurrent;

  const nix = discovered.find(
    ({ info, provider }) => info.rdns === 'com.nixwallet.extension' || provider.isNixWallet,
  );

  if (nix) return nix;
  if (window.ethereum?.isNixWallet) {
    return {
      info: {
        uuid: 'window.ethereum',
        name: 'NixWallet',
        icon: '',
        rdns: 'com.nixwallet.extension',
      },
      provider: window.ethereum,
    };
  }
  return null;
}

export async function discoverTypedDataNixWallet(timeoutMs = 800): Promise<DiscoveredProvider | null> {
  const found = await discoverNixWallet(timeoutMs);
  if (found?.provider.nixWalletSupportsTypedData) return found;
  return null;
}

export async function connectNixWallet(provider: EthereumProvider): Promise<string[]> {
  return provider.request({ method: 'eth_requestAccounts' }) as Promise<string[]>;
}

export async function getConnectedAccounts(provider: EthereumProvider): Promise<string[]> {
  return provider.request({ method: 'eth_accounts' }) as Promise<string[]>;
}

export async function getChainId(provider: EthereumProvider): Promise<string> {
  return provider.request({ method: 'eth_chainId' }) as Promise<string>;
}

export async function switchChain(provider: EthereumProvider, chainHex: string): Promise<void> {
  await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
}
