import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Globe2, ShieldCheck, X } from 'lucide-react';
import { ethers } from 'ethers';
import { getNetworkByChainId } from '../lib/wallet';
import { WRAPPER_ABI } from '../lib/contracts';

interface PendingProviderRequest {
  key: string;
  id?: number;
  method: string;
  origin: string;
  params?: unknown[];
  createdAt: number;
  chainId: number;
}

interface Props {
  address: string;
}

const ERC20_INTERFACE = new ethers.Interface([
  'function approve(address spender, uint256 amount)',
  'function transfer(address to, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
]);

const WRAPPER_INTERFACE = new ethers.Interface(WRAPPER_ABI);

function shorten(value?: string) {
  if (!value) return 'n/a';
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatMethod(method: string) {
  switch (method) {
    case 'eth_requestAccounts':
      return 'Connect Wallet';
    case 'personal_sign':
    case 'eth_sign':
      return 'Sign Message';
    case 'eth_signTypedData_v4':
      return 'Sign Typed Data';
    case 'eth_sendTransaction':
      return 'Confirm Transaction';
    case 'wallet_switchEthereumChain':
      return 'Switch Network';
    default:
      return method;
  }
}

function decodeHexMessage(hex?: string) {
  if (!hex) return '';
  try {
    return ethers.toUtf8String(hex);
  } catch {
    return hex;
  }
}

function getTxParams(request: PendingProviderRequest): Record<string, unknown> | null {
  if (request.method !== 'eth_sendTransaction') return null;
  const tx = request.params?.[0];
  return tx && typeof tx === 'object' ? tx as Record<string, unknown> : null;
}

function describeCallData(data?: string) {
  if (!data || data === '0x') return null;
  try {
    const parsed = ERC20_INTERFACE.parseTransaction({ data });
    if (parsed?.name === 'approve') {
      return {
        title: 'ERC-20 approval',
        rows: [
          ['Spender', String(parsed.args[0])],
          ['Amount (raw units)', parsed.args[1].toString()],
        ],
        warning: parsed.args[1] > (2n ** 200n) ? 'Very large or unlimited token approval requested.' : null,
      };
    }
    if (parsed?.name === 'transfer') {
      return {
        title: 'ERC-20 transfer',
        rows: [
          ['Recipient', String(parsed.args[0])],
          ['Token amount (raw units)', parsed.args[1].toString()],
        ],
        warning: null,
      };
    }
    if (parsed?.name === 'transferFrom') {
      return {
        title: 'ERC-20 transferFrom',
        rows: [
          ['From', String(parsed.args[0])],
          ['Recipient', String(parsed.args[1])],
          ['Token amount (raw units)', parsed.args[2].toString()],
        ],
        warning: null,
      };
    }
    return { title: `ERC-20 ${parsed?.name}`, rows: parsed?.args.map((arg, idx) => [`Arg ${idx + 1}`, String(arg)]) || [], warning: null };
  } catch {
    // Try FHERC20 wrapper ABI next.
  }
  try {
    const parsed = WRAPPER_INTERFACE.parseTransaction({ data });
    const labels: Record<string, string> = {
      shield: 'Wrap public token into confidential balance',
      unshield: 'Request unwrap from confidential balance',
      claimUnshielded: 'Claim unwrapped public tokens',
      claimUnshieldedBatch: 'Claim multiple unwrap requests',
      confidentialTransfer: 'Send confidential transfer',
    };
    return {
      title: labels[parsed?.name || ''] || `FHERC20 ${parsed?.name}`,
      rows: parsed?.args.map((arg, idx) => [`Arg ${idx + 1}`, typeof arg === 'bigint' ? arg.toString() : String(arg)]) || [],
      warning: parsed?.name === 'confidentialTransfer' ? 'The amount stays encrypted on-chain, but addresses and transaction metadata remain public.' : null,
    };
  } catch {
    return {
      title: 'Unknown contract call',
      rows: [['Selector', data.slice(0, 10)], ['Calldata', data]],
      warning: 'NixWallet could not decode this transaction. Review the destination and calldata carefully.',
    };
  }
}

function RequestDetails({ request, address }: { request: PendingProviderRequest; address: string }) {
  const network = getNetworkByChainId(request.chainId);
  const tx = getTxParams(request);
  const data = typeof tx?.data === 'string' ? tx.data : undefined;
  const decoded = describeCallData(data);
  const requestedChain = request.method === 'wallet_switchEthereumChain'
    ? (request.params?.[0] as { chainId?: string } | undefined)?.chainId
    : null;
  const requestedNetwork = requestedChain ? getNetworkByChainId(Number.parseInt(requestedChain, 16)) : null;

  return (
    <div className="space-y-3">
      <div className="bg-app border border-ui p-3 space-y-2">
        <Row label="Request from" value={request.origin} />
        <Row label="Account" value={address || 'Unlock wallet first'} mono />
        <Row label="Network" value={network ? `${network.name} (${network.chainId})` : String(request.chainId)} />
      </div>

      {request.method === 'eth_requestAccounts' && (
        <InfoBox text="This site wants to view your active NixWallet account address. It cannot move funds without a separate approval." />
      )}

      {(request.method === 'personal_sign' || request.method === 'eth_sign') && (
        <div className="bg-app border border-ui p-3 space-y-2">
          <Row label="Message" value={decodeHexMessage(String(request.params?.[0] || request.params?.[1] || ''))} />
          <Warning text="Only sign messages from sites you trust. Signing can prove account ownership or authorize off-chain actions." />
        </div>
      )}

      {request.method === 'eth_signTypedData_v4' && (
        <div className="bg-app border border-ui p-3 space-y-2">
          <Row label="Typed data" value={String(request.params?.[1] || '')} />
        </div>
      )}

      {request.method === 'wallet_switchEthereumChain' && (
        <div className="bg-app border border-ui p-3 space-y-2">
          <Row label="Switch to" value={requestedNetwork ? `${requestedNetwork.name} (${requestedNetwork.chainId})` : requestedChain || 'Unknown chain'} />
        </div>
      )}

      {tx && (
        <div className="bg-app border border-ui p-3 space-y-2">
          <Row label="To" value={String(tx.to || 'Contract creation')} mono />
          <Row label="From" value={String(tx.from || address || 'active account')} mono />
          <Row label="Native value" value={tx.value ? `${ethers.formatEther(BigInt(String(tx.value)))} ETH` : '0 ETH'} />
          {tx.gas ? <Row label="Gas limit" value={String(BigInt(String(tx.gas)))} /> : null}
          {tx.maxFeePerGas ? <Row label="Max fee" value={`${ethers.formatUnits(BigInt(String(tx.maxFeePerGas)), 'gwei')} gwei`} /> : null}
          {tx.maxPriorityFeePerGas ? <Row label="Priority fee" value={`${ethers.formatUnits(BigInt(String(tx.maxPriorityFeePerGas)), 'gwei')} gwei`} /> : null}
          {decoded && (
            <div className="pt-2 border-t border-ui space-y-2">
              <div className="text-detail font-bold text-brand-cyan uppercase tracking-widest">{decoded.title}</div>
              {decoded.rows.slice(0, 5).map(([label, value]) => (
                <Row key={`${label}-${value}`} label={label} value={value} mono={value.length > 20} />
              ))}
              {decoded.rows.length > 5 && <Row label="More" value={`${decoded.rows.length - 5} additional values hidden`} />}
              {decoded.warning && <Warning text={decoded.warning} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-detail">
      <span className="text-sub shrink-0">{label}</span>
      <span className={`text-main text-right break-all ${mono ? 'font-mono' : ''}`}>{mono ? shorten(value) : value}</span>
    </div>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <div className="flex gap-2 text-detail text-amber-300 bg-amber-500/10 border border-amber-400/40 p-2">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function InfoBox({ text }: { text: string }) {
  return (
    <div className="flex gap-2 text-detail text-slate-100 bg-brand-cyan/10 border border-brand-cyan/50 p-2">
      <ShieldCheck className="w-4 h-4 shrink-0 text-brand-cyan" />
      <span>{text}</span>
    </div>
  );
}

export default function DappRequestApprovalOverlay({ address }: Props) {
  const [requests, setRequests] = useState<PendingProviderRequest[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [actionError, setActionError] = useState('');

  const active = requests[activeIndex] || requests[0] || null;

  const load = async () => {
    const res = await chrome.runtime.sendMessage({ type: 'LIST_PENDING_PROVIDER_REQUESTS' });
    const items = (res?.items || []) as PendingProviderRequest[];
    setRequests(items);
    if (items.length > 0) setIsOpen(true);
    setActiveIndex((idx) => Math.min(idx, Math.max(items.length - 1, 0)));
  };

  useEffect(() => {
    const listener = (message: { type?: string }) => {
      if (message.type === 'PROVIDER_APPROVALS_UPDATED') {
        load().catch(() => {});
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    window.setTimeout(() => load().catch(() => {}), 0);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const pendingCount = requests.length;
  const title = useMemo(() => active ? formatMethod(active.method) : 'Pending request', [active]);
  const isUnlocked = Boolean(address);

  const act = async (approve: boolean) => {
    if (!active) return;
    if (approve && !isUnlocked) return;
    setActionError('');
    const response = await chrome.runtime.sendMessage({
      type: approve ? 'APPROVE_PROVIDER_REQUEST' : 'REJECT_PROVIDER_REQUEST',
      payload: { key: active.key },
    });
    if (response?.error) {
      setActionError(String(response.error));
      return;
    }
    await load();
  };

  const rejectAll = async () => {
    await chrome.runtime.sendMessage({ type: 'REJECT_ALL_PROVIDER_REQUESTS' });
    await load();
  };

  if (pendingCount === 0) return null;

  return (
    <div className="ui-density-comfortable">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-5 right-5 z-[200] bg-brand-cyan text-brand-midnight border border-brand-cyan shadow-[0_0_24px_rgba(10,217,220,0.35)] rounded-full w-14 h-14 flex items-center justify-center"
          aria-label="Open pending dApp requests"
        >
          <Globe2 className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-caption font-bold rounded-full min-w-5 h-5 flex items-center justify-center px-1">
            {pendingCount}
          </span>
        </button>
      )}

      {isOpen && active && (
        <div className="fixed inset-0 z-[210] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-[430px] bg-brand-midnight border-2 border-brand-cyan/50 shadow-[0_24px_80px_rgba(0,0,0,0.55)] max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-4 py-4 border-b-2 border-brand-cyan/40 flex items-start justify-between gap-3 bg-[#021b2a]">
              <div className="min-w-0">
                <div className="text-caption text-brand-cyan uppercase tracking-[0.22em] font-black">NixWallet Request</div>
                <div className="mt-1 text-xl leading-none font-brand font-black uppercase tracking-wide text-white">{title}</div>
                <div className="mt-2 inline-flex max-w-full border border-white/10 bg-white/5 px-2 py-1 text-caption text-slate-300 font-mono">
                  <span className="truncate">{active.origin}</span>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="shrink-0 border border-white/10 bg-white/5 p-2 text-slate-300 hover:border-brand-cyan hover:text-brand-cyan"
                aria-label="Close request modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pendingCount > 1 && (
              <div className="px-4 py-2 border-b-2 border-brand-cyan/40 bg-[#021b2a] flex items-center justify-between text-detail text-slate-300">
                <button disabled={activeIndex === 0} onClick={() => setActiveIndex((i) => Math.max(0, i - 1))} className="disabled:opacity-30 flex items-center gap-1 hover:text-brand-cyan">
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <span>{activeIndex + 1} of {pendingCount}</span>
                <button disabled={activeIndex >= pendingCount - 1} onClick={() => setActiveIndex((i) => Math.min(pendingCount - 1, i + 1))} className="disabled:opacity-30 flex items-center gap-1 hover:text-brand-cyan">
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="p-4 overflow-y-auto bg-brand-midnight">
              <RequestDetails request={active} address={address} />
            </div>

            <div className="p-4 border-t-2 border-brand-cyan/40 bg-[#021b2a] space-y-2">
              {!isUnlocked && (
                <div className="border border-amber-400/40 bg-amber-500/10 p-2 text-detail leading-relaxed text-amber-100">
                  Unlock NixWallet before approving this request. The site cannot receive approval while the wallet is locked.
                </div>
              )}
              {actionError && (
                <div className="border border-red-400/35 bg-red-500/10 p-2 text-detail leading-relaxed text-red-100">
                  {actionError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => act(false)} className="py-3 border border-white/45 bg-white/5 text-white text-[13px] font-black uppercase tracking-widest hover:border-red-400 hover:text-red-300">
                  Reject
                </button>
                <button
                  onClick={() => act(true)}
                  disabled={!isUnlocked}
                  className="py-3 border border-brand-cyan bg-brand-cyan text-brand-midnight text-[13px] font-black uppercase tracking-widest shadow-[0_0_22px_rgba(10,217,220,0.22)] hover:bg-cyan-200 disabled:border-slate-500/40 disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
                >
                  {isUnlocked ? 'Approve' : 'Unlock First'}
                </button>
              </div>
              {pendingCount > 1 && (
                <button onClick={rejectAll} className="w-full py-2 text-caption uppercase tracking-widest text-red-300 hover:text-red-200">
                  Reject all pending requests
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
