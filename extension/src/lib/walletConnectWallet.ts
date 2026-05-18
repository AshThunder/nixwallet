import { Core } from '@walletconnect/core';
import { Web3Wallet, type IWeb3Wallet } from '@walletconnect/web3wallet';
import { buildApprovedNamespaces, getSdkError } from '@walletconnect/utils';
import { ethers } from 'ethers';
import { getActiveNetwork, getNetworkByChainId, getSigner, setActiveNetwork, type NetworkId } from './wallet';
import { NIX_WALLET_METADATA } from './walletMetadata';
import { recordExternalTransaction } from './externalActivity';

type Listener = () => void;

export interface WalletConnectPendingProposal {
  id: number;
  name: string;
  url: string;
  chains: string[];
  methods: string[];
}

export interface WalletConnectActiveSession {
  topic: string;
  name: string;
  url: string;
  chains: string[];
}

export interface WalletConnectPendingRequest {
  key: string;
  topic: string;
  requestId: number;
  method: string;
  chainId?: string;
}

interface WalletContext {
  address: string;
  privateKey: string;
  onNetworkChange?: (id: NetworkId) => void;
}

interface WalletConnectRequestEvent {
  topic: string;
  id: number;
  params: {
    chainId?: string;
    request: {
      method: string;
      params: unknown[];
    };
  };
}

let wallet: IWeb3Wallet | null = null;
let context: WalletContext | null = null;
let projectId: string | null = null;
const listeners = new Set<Listener>();
interface SessionProposalLike {
  id: number;
  raw: unknown;
  requiredNamespaces?: {
    eip155?: {
      chains?: string[];
      methods?: string[];
    };
  };
  proposer: {
    metadata: {
      name: string;
      url: string;
    };
  };
}

const pending = new Map<number, SessionProposalLike>();
const pendingRequests = new Map<string, WalletConnectRequestEvent>();

function notify() {
  listeners.forEach((fn) => fn());
}

function getChainNamespaceList() {
  return ['eip155:11155111', 'eip155:84532', 'eip155:421614'];
}

function toActiveSessions(): WalletConnectActiveSession[] {
  if (!wallet) return [];
  return Object.values(wallet.getActiveSessions()).map((session) => ({
    topic: session.topic,
    name: session.peer.metadata.name,
    url: session.peer.metadata.url,
    chains: session.namespaces.eip155?.chains || [],
  }));
}

function toPendingRequests(): WalletConnectPendingRequest[] {
  return Array.from(pendingRequests.values()).map((req) => ({
    key: `${req.topic}:${req.id}`,
    topic: req.topic,
    requestId: req.id,
    method: req.params.request.method,
    chainId: req.params.chainId,
  }));
}

function toPending(): WalletConnectPendingProposal[] {
  return Array.from(pending.values()).map((proposal) => {
    const req = proposal.requiredNamespaces?.eip155;
    return {
      id: Number(proposal.id),
      name: proposal.proposer.metadata.name,
      url: proposal.proposer.metadata.url,
      chains: req?.chains || [],
      methods: req?.methods || [],
    };
  });
}

async function ensureRequestChain(chainRef: string) {
  const chainIdRaw = chainRef.split(':')[1];
  const chainId = Number(chainIdRaw);
  if (!Number.isFinite(chainId)) return;
  const target = getNetworkByChainId(chainId);
  if (!target) throw new Error(`Unsupported chain ${chainRef}`);
  const active = getActiveNetwork();
  if (active.id !== target.id) {
    setActiveNetwork(target.id);
    context?.onNetworkChange?.(target.id);
  }
}

function toEthError(message: string, code = 5000) {
  return { code, message };
}

async function handleRequest(event: WalletConnectRequestEvent) {
  if (!wallet || !context) return;
  const { topic, params, id } = event;
  const { request, chainId } = params;
  const method = request.method as string;

  try {
    if (chainId) await ensureRequestChain(chainId);
    const signer = getSigner(context.privateKey);
    let result: unknown;

    switch (method) {
      case 'eth_accounts':
      case 'eth_requestAccounts':
        result = [context.address];
        break;
      case 'eth_chainId':
        result = `0x${getActiveNetwork().chainId.toString(16)}`;
        break;
      case 'personal_sign': {
        const [message, address] = request.params as [string, string];
        if (address?.toLowerCase() !== context.address.toLowerCase()) {
          throw new Error('Address mismatch for personal_sign');
        }
        result = await signer.signMessage(ethers.getBytes(message));
        break;
      }
      case 'eth_sign': {
        const [address, message] = request.params as [string, string];
        if (address?.toLowerCase() !== context.address.toLowerCase()) {
          throw new Error('Address mismatch for eth_sign');
        }
        result = await signer.signMessage(ethers.getBytes(message));
        break;
      }
      case 'eth_signTypedData_v4': {
        const [address, typedDataRaw] = request.params as [string, string];
        if (address?.toLowerCase() !== context.address.toLowerCase()) {
          throw new Error('Address mismatch for typed data');
        }
        const typedData = JSON.parse(typedDataRaw);
        const { domain, types, message } = typedData;
        delete types.EIP712Domain;
        result = await signer.signTypedData(domain, types, message);
        break;
      }
      case 'eth_sendTransaction': {
        const [tx] = request.params as [Record<string, unknown>];
        const sent = await signer.sendTransaction({
          to: tx.to as string,
          data: tx.data as string | undefined,
          value: tx.value ? BigInt(tx.value as string) : undefined,
          gasLimit: tx.gas ? BigInt(tx.gas as string) : undefined,
          maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas as string) : undefined,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas as string) : undefined,
          nonce: typeof tx.nonce === 'string' ? Number(tx.nonce) : undefined,
        });
        result = sent.hash;
        const network = getActiveNetwork();
        await recordExternalTransaction({
          hash: sent.hash,
          tx,
          network,
          address: context.address,
          source: 'walletconnect',
          requestId: `${topic}:${id}`,
        });
        break;
      }
      default:
        throw new Error(`Unsupported WalletConnect method: ${method}`);
    }

    await wallet.respondSessionRequest({
      topic,
      response: {
        id,
        jsonrpc: '2.0',
        result,
      },
    });
  } catch (err: unknown) {
    await wallet.respondSessionRequest({
      topic,
      response: {
        id,
        jsonrpc: '2.0',
        error: toEthError(err instanceof Error ? err.message : 'Request failed'),
      },
    });
  }
}

async function processRequest(event: WalletConnectRequestEvent) {
  await handleRequest(event);
  pendingRequests.delete(`${event.topic}:${event.id}`);
  notify();
}

export async function initWalletConnect(input: {
  projectId: string;
  context: WalletContext;
}) {
  context = input.context;
  projectId = input.projectId;
  if (wallet) return;

  const core = new Core({ projectId: input.projectId });
  wallet = await Web3Wallet.init({
    core: core as unknown as Parameters<typeof Web3Wallet.init>[0]['core'],
    metadata: {
      name: NIX_WALLET_METADATA.name,
      description: NIX_WALLET_METADATA.description,
      url: NIX_WALLET_METADATA.url,
      icons: NIX_WALLET_METADATA.icons,
    },
  });

  wallet.on('session_proposal', async (proposal) => {
    const p = proposal as unknown as {
      id: number;
      requiredNamespaces?: SessionProposalLike['requiredNamespaces'];
      proposer: SessionProposalLike['proposer'];
    };
    pending.set(Number(p.id), {
      id: Number(p.id),
      raw: proposal,
      requiredNamespaces: p.requiredNamespaces,
      proposer: p.proposer,
    });
    notify();
  });

  wallet.on('session_delete', async () => {
    notify();
  });

  wallet.on('session_request', async (event) => {
    const typed = event as unknown as WalletConnectRequestEvent;
    pendingRequests.set(`${typed.topic}:${typed.id}`, typed);
    notify();
  });

  notify();
}

export function updateWalletConnectContext(next: WalletContext) {
  context = next;
}

export async function pairWalletConnect(uri: string) {
  if (!wallet) throw new Error('WalletConnect is not initialized');
  await wallet.core.pairing.pair({ uri });
}

export async function approveWalletConnectRequest(key: string) {
  const event = pendingRequests.get(key);
  if (!event) throw new Error('Request not found');
  await processRequest(event);
}

export async function rejectWalletConnectRequest(key: string) {
  if (!wallet) throw new Error('WalletConnect is not initialized');
  const event = pendingRequests.get(key);
  if (!event) return;
  await wallet.respondSessionRequest({
    topic: event.topic,
    response: {
      id: event.id,
      jsonrpc: '2.0',
      error: toEthError('User rejected WalletConnect request', 4001),
    },
  });
  pendingRequests.delete(key);
  notify();
}

export async function approveWalletConnectProposal(id: number) {
  if (!wallet || !context) throw new Error('WalletConnect is not initialized');
  const currentContext = context;
  const proposal = pending.get(id);
  if (!proposal) throw new Error('Proposal not found');

  const approved = buildApprovedNamespaces({
    proposal: proposal.raw as Parameters<typeof buildApprovedNamespaces>[0]['proposal'],
    supportedNamespaces: {
      eip155: {
        chains: getChainNamespaceList(),
        methods: [
          'eth_accounts',
          'eth_requestAccounts',
          'eth_chainId',
          'eth_sign',
          'personal_sign',
          'eth_signTypedData_v4',
          'eth_sendTransaction',
        ],
        events: ['accountsChanged', 'chainChanged'],
        accounts: getChainNamespaceList().map((chain) => `${chain}:${currentContext.address}`),
      },
    },
  });

  await wallet.approveSession({
    id: proposal.id,
    namespaces: approved,
  });
  pending.delete(id);
  notify();
}

export async function rejectWalletConnectProposal(id: number) {
  if (!wallet) throw new Error('WalletConnect is not initialized');
  const proposal = pending.get(id);
  if (!proposal) return;
  await wallet.rejectSession({
    id: proposal.id,
    reason: getSdkError('USER_REJECTED'),
  });
  pending.delete(id);
  notify();
}

export async function disconnectWalletConnectSession(topic: string) {
  if (!wallet) throw new Error('WalletConnect is not initialized');
  await wallet.disconnectSession({
    topic,
    reason: getSdkError('USER_DISCONNECTED'),
  });
  notify();
}

export function getWalletConnectState() {
  return {
    initialized: !!wallet,
    hasProjectId: !!projectId,
    pendingProposals: toPending(),
    pendingRequests: toPendingRequests(),
    activeSessions: toActiveSessions(),
  };
}

export function subscribeWalletConnect(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
