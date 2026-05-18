import { Encryptable, FheTypes } from '@cofhe/sdk';
import { Ethers6Adapter } from '@cofhe/sdk/adapters';
import {
  sepolia as cofheSepolia,
  baseSepolia as cofheBaseSepolia,
  arbSepolia as cofheArbSepolia,
} from '@cofhe/sdk/chains';
import { PermitUtils } from '@cofhe/sdk/permits';
import { createCofheClient, createCofheConfig } from '@cofhe/sdk/web';
import { BrowserProvider, type Signer } from 'ethers';
import { type DappNetwork } from '../config/networks';
import { type EthereumProvider } from './nixProvider';

/* eslint-disable @typescript-eslint/no-explicit-any -- CoFHE SDK types are intentionally opaque here. */
type CofheClient = any;
type CofhePublicClient = any;
type CofheWalletClient = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

let client: CofheClient | null = null;
let publicClient: CofhePublicClient | null = null;
let walletClient: CofheWalletClient | null = null;
let currentAccount = '';
let currentChainId = 0;

function getCofheChain(network: DappNetwork) {
  if (network.id === 'baseSepolia') return cofheBaseSepolia;
  if (network.id === 'arbitrumSepolia') return cofheArbSepolia;
  return cofheSepolia;
}

function withConnectedAccount(provider: EthereumProvider, account: string): EthereumProvider {
  return {
    ...provider,
    isNixWallet: provider.isNixWallet,
    request: (args) => {
      if (args.method === 'eth_accounts' || args.method === 'eth_requestAccounts') {
        return Promise.resolve([account]);
      }
      return provider.request(args);
    },
    on: provider.on?.bind(provider),
    removeListener: provider.removeListener?.bind(provider),
  };
}

export async function initCofheBrowser(provider: EthereumProvider, network: DappNetwork, account: string) {
  if (client && currentAccount.toLowerCase() === account.toLowerCase() && currentChainId === network.chainId) {
    return client;
  }

  const accountProvider = withConnectedAccount(provider, account);
  const browserProvider = new BrowserProvider(accountProvider, network.chainId);
  const signer: Signer = await browserProvider.getSigner(account);
  const adapter = await Ethers6Adapter(browserProvider, signer);
  const config = createCofheConfig({
    environment: 'web',
    supportedChains: [getCofheChain(network)],
    fheKeyStorage: null,
  });

  client = createCofheClient(config);
  publicClient = adapter.publicClient;
  walletClient = adapter.walletClient;
  await client.connect(publicClient, walletClient);
  currentAccount = account;
  currentChainId = network.chainId;
  return client;
}

export async function encryptAmount64(provider: EthereumProvider, network: DappNetwork, account: string, amount: bigint) {
  const cofhe = await initCofheBrowser(provider, network, account);
  const [encrypted] = await cofhe.encryptInputs([Encryptable.uint64(amount)]).execute();
  return encrypted;
}

export async function decryptForView(provider: EthereumProvider, network: DappNetwork, account: string, ctHash: string): Promise<bigint> {
  const cofhe = await initCofheBrowser(provider, network, account);
  if (!publicClient || !walletClient) {
    throw new Error('CoFHE permit clients are not initialized.');
  }
  const unsigned = PermitUtils.createSelf({ issuer: account });
  const permit = await PermitUtils.sign(unsigned, publicClient, walletClient);
  return cofhe
    .decryptForView(ctHash, FheTypes.Uint64)
    .setChainId(network.chainId)
    .setAccount(account)
    .withPermit(permit)
    .execute();
}

export async function decryptForTx(provider: EthereumProvider, network: DappNetwork, account: string, ctHash: string): Promise<{
  decryptedValue: bigint;
  signature: string;
}> {
  const cofhe = await initCofheBrowser(provider, network, account);
  return cofhe
    .decryptForTx(ctHash)
    .setChainId(network.chainId)
    .setAccount(account)
    .withoutPermit()
    .execute();
}
