import { useEffect, useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import {
  approveWalletConnectRequest,
  approveWalletConnectProposal,
  disconnectWalletConnectSession,
  getWalletConnectState,
  initWalletConnect,
  pairWalletConnect,
  rejectWalletConnectRequest,
  rejectWalletConnectProposal,
  subscribeWalletConnect,
  updateWalletConnectContext,
} from '../lib/walletConnectWallet';
import { NIX_WALLET_METADATA } from '../lib/walletMetadata';
import type { NetworkId } from '../lib/wallet';

interface DappPermissionItem {
  origin: string;
  accounts: string[];
  connectedAt: number;
  lastUsedAt: number;
  activeChainId: number;
}

interface PendingProviderRequestItem {
  key: string;
  id?: number;
  method: string;
  origin: string;
  createdAt: number;
  chainId: number;
}

interface Props {
  onBack: () => void;
  address: string;
  privateKey: string;
  onNetworkChange: (id: NetworkId) => void;
}

export default function DappsScreen({ onBack, address, privateKey, onNetworkChange }: Props) {
  const [items, setItems] = useState<DappPermissionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [wcProjectId] = useState(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '');
  const [wcUri, setWcUri] = useState('');
  const [wcStatus, setWcStatus] = useState<string | null>(null);
  const [wcInitialized, setWcInitialized] = useState(false);
  const [wcPending, setWcPending] = useState<ReturnType<typeof getWalletConnectState>['pendingProposals']>([]);
  const [wcSessions, setWcSessions] = useState<ReturnType<typeof getWalletConnectState>['activeSessions']>([]);
  const [wcPendingRequests, setWcPendingRequests] = useState<ReturnType<typeof getWalletConnectState>['pendingRequests']>([]);
  const [pendingProviderRequests, setPendingProviderRequests] = useState<PendingProviderRequestItem[]>([]);

  const load = async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'LIST_DAPP_PERMISSIONS' });
      if (res?.error) throw new Error(res.error);
      setItems((res?.items || []) as DappPermissionItem[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load connected dApps');
    }
  };

  const loadPendingProviderRequests = async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'LIST_PENDING_PROVIDER_REQUESTS' });
      if (res?.error) throw new Error(res.error);
      setPendingProviderRequests((res?.items || []) as PendingProviderRequestItem[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load pending approvals');
    }
  };

  useEffect(() => {
    load();
    loadPendingProviderRequests();
    const unsub = subscribeWalletConnect(() => {
      const state = getWalletConnectState();
      setWcInitialized(state.initialized);
      setWcPending(state.pendingProposals);
      setWcPendingRequests(state.pendingRequests);
      setWcSessions(state.activeSessions);
    });
    const state = getWalletConnectState();
    setWcInitialized(state.initialized);
    setWcPending(state.pendingProposals);
    setWcPendingRequests(state.pendingRequests);
    setWcSessions(state.activeSessions);
    const listener = (message: { type?: string }) => {
      if (message.type === 'PROVIDER_APPROVALS_UPDATED') {
        loadPendingProviderRequests();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      unsub();
    };
  }, []);

  useEffect(() => {
    updateWalletConnectContext({ address, privateKey, onNetworkChange });
  }, [address, privateKey, onNetworkChange]);

  const handleRevoke = async (origin: string) => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'REVOKE_DAPP_PERMISSION', origin });
      if (res?.error) throw new Error(res.error);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to revoke dApp');
    }
  };

  const handleInitWalletConnect = async () => {
    setWcStatus(null);
    try {
      if (!wcProjectId) throw new Error('Set WalletConnect project id first');
      await initWalletConnect({
        projectId: wcProjectId.trim(),
        context: { address, privateKey, onNetworkChange },
      });
      const state = getWalletConnectState();
      setWcInitialized(state.initialized);
      setWcPending(state.pendingProposals);
      setWcPendingRequests(state.pendingRequests);
      setWcSessions(state.activeSessions);
      setWcStatus('WalletConnect initialized');
    } catch (e: unknown) {
      setWcStatus(e instanceof Error ? e.message : 'WalletConnect init failed');
    }
  };

  const handlePair = async () => {
    setWcStatus(null);
    try {
      if (!wcUri.trim()) throw new Error('Paste WalletConnect URI');
      await pairWalletConnect(wcUri.trim());
      setWcUri('');
      setWcStatus('Pairing request sent');
    } catch (e: unknown) {
      setWcStatus(e instanceof Error ? e.message : 'Pairing failed');
    }
  };

  const handleProviderRequestAction = async (key: string, approve: boolean) => {
    try {
      const res = await chrome.runtime.sendMessage({
        type: approve ? 'APPROVE_PROVIDER_REQUEST' : 'REJECT_PROVIDER_REQUEST',
        payload: { key },
      });
      if (res?.error) throw new Error(res.error);
      await loadPendingProviderRequests();
      setWcStatus(approve ? 'Approved dApp request' : 'Rejected dApp request');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to process request');
    }
  };

  return (
    <div className="w-full min-h-screen bg-app text-main font-sans flex flex-col relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-[100px] left-[-100px] w-64 h-64 bg-brand-cyan/5 mix-blend-screen filter blur-[100px]" />

      {/* Header */}
      <header className="w-full p-6 flex flex-col gap-2 relative z-10 border-b border-ui">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-sub hover:text-brand-cyan transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold font-brand uppercase tracking-tighter">Connected DApps</h1>
        </div>
        <p className="text-xs text-sub pl-9">Manage websites connected to your wallet.</p>
      </header>

      {/* Connected apps */}
      <main className="flex-1 p-6 relative z-10 space-y-4">
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3">{error}</div>
        )}

        <div className="bg-surface border border-ui p-4 space-y-3">
          <div className="text-sm font-bold">WalletConnect (Wallet mode)</div>
          <div className="text-[10px] text-sub font-mono break-all">
            {wcProjectId ? `Project ID detected from env: ${wcProjectId}` : 'Missing VITE_WALLETCONNECT_PROJECT_ID in extension/.env.local'}
          </div>
          {!wcProjectId && (
            <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 p-2">
              Add `VITE_WALLETCONNECT_PROJECT_ID` to `extension/.env.local`, then rebuild.
            </div>
          )}
          <div className="text-[10px] text-sub">
            Metadata: {NIX_WALLET_METADATA.name} · {NIX_WALLET_METADATA.url}
          </div>
          <button onClick={handleInitWalletConnect} className="w-full py-2 bg-brand-cyan/10 border border-brand-cyan/30 text-brand-cyan text-xs font-bold uppercase tracking-widest">
            {wcInitialized ? 'Reinitialize WalletConnect' : 'Initialize WalletConnect'}
          </button>
          <input
            value={wcUri}
            onChange={(e) => setWcUri(e.target.value)}
            placeholder="wc:...."
            className="w-full bg-app border border-ui px-3 py-2 text-xs font-mono"
          />
          <button onClick={handlePair} className="w-full py-2 bg-brand-cyan text-brand-midnight text-xs font-bold uppercase tracking-widest">
            Pair URI
          </button>
          {wcStatus && (
            <div className="text-[11px] text-sub">{wcStatus}</div>
          )}
        </div>

        {wcPending.length > 0 && (
          <div className="bg-surface border border-ui p-4 space-y-3">
            <div className="text-sm font-bold">Pending WalletConnect Proposals</div>
            {wcPending.map((proposal) => (
              <div key={proposal.id} className="border border-ui p-3 space-y-2">
                <div className="text-xs font-bold">{proposal.name}</div>
                <div className="text-[10px] text-sub font-mono">{proposal.url}</div>
                <div className="text-[10px] text-sub">Chains: {proposal.chains.join(', ') || 'n/a'}</div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await approveWalletConnectProposal(proposal.id);
                      setWcStatus(`Approved ${proposal.name}`);
                    }}
                    className="flex-1 py-2 bg-brand-cyan text-brand-midnight text-[10px] font-bold uppercase tracking-widest"
                  >
                    Approve
                  </button>
                  <button
                    onClick={async () => {
                      await rejectWalletConnectProposal(proposal.id);
                      setWcStatus(`Rejected ${proposal.name}`);
                    }}
                    className="flex-1 py-2 border border-ui text-[10px] font-bold uppercase tracking-widest hover:text-red-400"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {wcPendingRequests.length > 0 && (
          <div className="bg-surface border border-ui p-4 space-y-3">
            <div className="text-sm font-bold">Pending WalletConnect Requests</div>
            {wcPendingRequests.map((request) => (
              <div key={request.key} className="border border-ui p-3 space-y-2">
                <div className="text-xs font-bold font-mono">{request.method}</div>
                <div className="text-[10px] text-sub font-mono">Topic: {request.topic}</div>
                <div className="text-[10px] text-sub font-mono">Request ID: {request.requestId}</div>
                <div className="text-[10px] text-sub font-mono">Chain: {request.chainId || 'active chain'}</div>
                <div className="text-[10px] text-sub font-mono">Account: {address}</div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await approveWalletConnectRequest(request.key);
                      setWcStatus(`Approved request ${request.method}`);
                    }}
                    className="flex-1 py-2 bg-brand-cyan text-brand-midnight text-[10px] font-bold uppercase tracking-widest"
                  >
                    Approve
                  </button>
                  <button
                    onClick={async () => {
                      await rejectWalletConnectRequest(request.key);
                      setWcStatus(`Rejected request ${request.method}`);
                    }}
                    className="flex-1 py-2 border border-ui text-[10px] font-bold uppercase tracking-widest hover:text-red-400"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {wcSessions.length > 0 && (
          <div className="bg-surface border border-ui p-4 space-y-3">
            <div className="text-sm font-bold">Active WalletConnect Sessions</div>
            {wcSessions.map((session) => (
              <div key={session.topic} className="border border-ui p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{session.name}</div>
                  <div className="text-[10px] text-sub font-mono truncate">{session.url}</div>
                </div>
                <button
                  onClick={async () => {
                    await disconnectWalletConnectSession(session.topic);
                    setWcStatus(`Disconnected ${session.name}`);
                  }}
                  className="text-sub p-2 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {pendingProviderRequests.length > 0 && (
          <div className="bg-surface border border-ui p-4 space-y-3">
            <div className="text-sm font-bold">Pending Site Requests (Injected)</div>
            {pendingProviderRequests.map((request) => (
              <div key={request.key} className="border border-ui p-3 space-y-2">
                <div className="text-xs font-bold font-mono">{request.method}</div>
                <div className="text-[10px] text-sub font-mono">Origin: {request.origin}</div>
                <div className="text-[10px] text-sub font-mono">Chain ID: {request.chainId}</div>
                <div className="text-[10px] text-sub font-mono">Account: {address}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleProviderRequestAction(request.key, true)}
                    className="flex-1 py-2 bg-brand-cyan text-brand-midnight text-[10px] font-bold uppercase tracking-widest"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleProviderRequestAction(request.key, false)}
                    className="flex-1 py-2 border border-ui text-[10px] font-bold uppercase tracking-widest hover:text-red-400"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {items.map((app) => {
          const host = app.origin.replace(/^https?:\/\//, '');
          const icon = host.slice(0, 1).toUpperCase();
          return (
          <div key={app.origin} className="bg-surface border border-ui p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-app border border-ui flex items-center justify-center text-sm font-bold text-brand-cyan">
                {icon}
              </div>
              <div>
                <div className="text-sm font-bold">{host}</div>
                <div className="text-xs text-sub font-mono">{app.origin}</div>
                <div className="text-[10px] text-sub font-mono mt-1">
                  {app.accounts.length} account{app.accounts.length === 1 ? '' : 's'} • chain {app.activeChainId}
                </div>
              </div>
            </div>
            <button onClick={() => handleRevoke(app.origin)} className="text-sub p-2 hover:text-red-400 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );})}

        {items.length === 0 && !error && (
          <div className="bg-surface border border-ui p-6 text-sm text-sub">
            No connected dApps yet. Connections appear here after `eth_requestAccounts`.
          </div>
        )}
      </main>
    </div>
  );
}
