import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRightLeft, CheckCircle2, ChevronDown, ExternalLink, Shield, Wallet } from 'lucide-react';
import { formatUnits, isAddress, parseUnits, ZeroHash } from 'ethers';
import { formatAmountDisplay } from './lib/format';
import {
  connectNixWallet,
  discoverNixWallet,
  discoverTypedDataNixWallet,
  getChainId,
  getConnectedAccounts,
  switchChain,
  type DiscoveredProvider,
  type EthereumProvider,
} from './lib/nixProvider';
import {
  approveWrapper,
  claimUnshielded,
  confidentialTransfer,
  getAllowance,
  getEncryptedBalance,
  getInjectedSigner,
  getNativePublicBalance,
  getNativeWrapperAddress,
  getOrCreateWrapper,
  getPendingClaims,
  getPublicBalance,
  getTokenMetadata,
  getWrapperAddress,
  isNativeWrapperConfigured,
  requestUnshield,
  shield,
  shieldNative,
  transferToken,
  type PendingClaim,
  type TokenMetadata,
} from './lib/contracts';
import { getNetworkByChainId, parseChainId, SUPPORTED_NETWORKS, type DappNetwork } from './config/networks';
import { CETH_DECIMALS, isNativeTokenAddress, NATIVE_TOKEN_METADATA } from './config/native';
import { getDefaultTokens } from './config/tokens';
import { decryptForTx, decryptForView, encryptAmount64 } from './lib/cofheBrowser';
import { withDecryptRetry } from './lib/decryptRetry';

const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/nixwallet/nkkaidapildbkjmnfeieepmejghgmipi';
const GITHUB_URL = 'https://github.com/AshThunder/nixwallet';
const NIXWALLET_SITE_URL = 'https://nixwallet.vercel.app';
const DAPP_SOURCE_URL = 'https://github.com/AshThunder/nixwallet/tree/main/dapp';

type Status = { kind: 'idle' | 'success' | 'error' | 'pending'; text: string };
type Activity = { id: string; label: string; detail: string; createdAt: number };
type ActionTab = 'transfer' | 'wrap' | 'confidential' | 'unwrap';
type ClaimStage = 'idle' | 'preparing' | 'ready' | 'claiming' | 'done' | 'error';
type ClaimState = { stage: ClaimStage; message?: string };

function short(address?: string) {
  if (!address) return 'Not connected';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function App() {
  const [providerInfo, setProviderInfo] = useState<DiscoveredProvider | null>(null);
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState<number | null>(null);
  const [tokenAddress, setTokenAddress] = useState('');
  const [token, setToken] = useState<TokenMetadata | null>(null);
  const [wrapperAddress, setWrapperAddress] = useState<string | null>(null);
  const [publicBalance, setPublicBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [encryptedBalance, setEncryptedBalance] = useState<string | null>(null);
  const [revealedBalance, setRevealedBalance] = useState<bigint | null>(null);
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [publicTransferTo, setPublicTransferTo] = useState('');
  const [publicTransferAmount, setPublicTransferAmount] = useState('');
  const [wrapAmount, setWrapAmount] = useState('');
  const [confidentialTransferTo, setConfidentialTransferTo] = useState('');
  const [confidentialTransferAmount, setConfidentialTransferAmount] = useState('');
  const [encryptedTransfer, setEncryptedTransfer] = useState({
    ctHash: '',
    securityZone: '0',
    utype: '4',
    signature: '',
  });
  const [isGeneratingEncryptedTransfer, setIsGeneratingEncryptedTransfer] = useState(false);
  const [unshieldTo, setUnshieldTo] = useState('');
  const [unwrapAmount, setUnwrapAmount] = useState('');
  const [claimStates, setClaimStates] = useState<Record<string, ClaimState>>({});
  const [isFinalizingUnwrap, setIsFinalizingUnwrap] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: 'Connect NixWallet to begin.' });
  const [activeAction, setActiveAction] = useState<ActionTab>('wrap');

  const network = useMemo(() => getNetworkByChainId(chainId), [chainId]);
  const provider = providerInfo?.provider || null;
  const defaultTokens = useMemo(() => getDefaultTokens(network), [network]);
  const isNativeAsset = token ? isNativeTokenAddress(token.address) : false;
  const confidentialDecimals = isNativeAsset ? CETH_DECIMALS : (token?.decimals ?? 6);

  const syncWalletState = useCallback(async (nextProvider: EthereumProvider, fallbackAccounts: string[] = []) => {
    const [accounts, chainHex] = await Promise.all([
      getConnectedAccounts(nextProvider).catch(() => []),
      getChainId(nextProvider).catch(() => null),
    ]);
    const nextAccount = accounts[0] || fallbackAccounts[0] || '';
    setAccount(nextAccount);
    setChainId(parseChainId(chainHex));
    return { account: nextAccount, chainId: parseChainId(chainHex) };
  }, []);

  const detectProvider = useCallback(async (timeoutMs = 1500) => {
    const found = await discoverNixWallet(timeoutMs);
    setProviderInfo(found);
    if (found) {
      await syncWalletState(found.provider);
    }
    if (!found) {
      setStatus({ kind: 'error', text: 'NixWallet was not detected. Reload the extension, then refresh this page.' });
    }
    return found;
  }, [syncWalletState]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void detectProvider();
    }, 0);
    return () => window.clearTimeout(id);
  }, [detectProvider]);

  useEffect(() => {
    if (!provider?.on) return;
    const onChainChanged = (next: unknown) => {
      setChainId(parseChainId(String(next)));
      setToken(null);
      setTokenAddress('');
      setWrapperAddress(null);
      setPublicBalance(null);
      setAllowance(null);
      setEncryptedBalance(null);
      setRevealedBalance(null);
      setClaims([]);
    };
    const onAccountsChanged = (next: unknown) => {
      const accounts = Array.isArray(next) ? next : [];
      setAccount(typeof accounts[0] === 'string' ? accounts[0] : '');
    };
    provider.on('chainChanged', onChainChanged);
    provider.on('accountsChanged', onAccountsChanged);
    return () => {
      provider.removeListener?.('chainChanged', onChainChanged);
      provider.removeListener?.('accountsChanged', onAccountsChanged);
    };
  }, [provider]);

  const refreshTokenState = async (nextToken = token, nextNetwork = network, nextAccount = account, nextWrapper = wrapperAddress) => {
    if (!nextToken || !nextNetwork || !nextAccount) return;

    let balance: bigint;
    let wrapper: string | null;

    if (isNativeTokenAddress(nextToken.address)) {
      wrapper = nextWrapper ?? (isNativeWrapperConfigured(nextNetwork.id) ? getNativeWrapperAddress(nextNetwork.id) : null);
      balance = await getNativePublicBalance(nextNetwork, nextAccount);
    } else {
      [balance, wrapper] = await Promise.all([
        getPublicBalance(nextNetwork, nextToken.address, nextAccount),
        nextWrapper ? Promise.resolve(nextWrapper) : getWrapperAddress(nextNetwork, nextToken.address),
      ]);
    }

    setPublicBalance(balance);
    setWrapperAddress(wrapper);

    if (wrapper) {
      const [nextAllowance, ctHash, pendingClaims] = await Promise.all([
        isNativeTokenAddress(nextToken.address)
          ? Promise.resolve(null)
          : getAllowance(nextNetwork, nextToken.address, nextAccount, wrapper),
        getEncryptedBalance(nextNetwork, wrapper, nextAccount).catch(() => null),
        getPendingClaims(nextNetwork, wrapper, nextAccount).catch(() => []),
      ]);
      setAllowance(nextAllowance);
      setEncryptedBalance(ctHash);
      setClaims(pendingClaims);
    } else {
      setAllowance(null);
      setEncryptedBalance(null);
      setClaims([]);
    }
  };

  const addActivity = (label: string, detail: string) => {
    setActivities((current) => [
      { id: `${Date.now()}-${label}`, label, detail, createdAt: Date.now() },
      ...current.slice(0, 9),
    ]);
  };

  const clearTokenState = () => {
    setToken(null);
    setWrapperAddress(null);
    setPublicBalance(null);
    setAllowance(null);
    setEncryptedBalance(null);
    setRevealedBalance(null);
    setClaims([]);
    setClaimStates({});
  };

  const updateClaimState = (ctHash: string, patch: ClaimState) => {
    setClaimStates((current) => ({
      ...current,
      [ctHash]: { ...current[ctHash], ...patch },
    }));
  };

  const loadNativeEth = async () => {
    if (!network || !account) return;
    if (!isNativeWrapperConfigured(network.id)) {
      setStatus({ kind: 'error', text: 'Native ETH wrapper not deployed on this network.' });
      return;
    }
    setStatus({ kind: 'pending', text: 'Loading native ETH wrapper...' });
    try {
      const wrapper = getNativeWrapperAddress(network.id);
      const meta: TokenMetadata = { ...NATIVE_TOKEN_METADATA };
      setToken(meta);
      setTokenAddress(meta.address);
      setRevealedBalance(null);
      setClaimStates({});
      await refreshTokenState(meta, network, account, wrapper);
      setStatus({ kind: 'success', text: 'Native ETH / cETH flows ready.' });
    } catch (error) {
      clearTokenState();
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Native ETH load failed.' });
    }
  };

  const loadTokenByAddress = async (address: string, label = 'Token') => {
    if (!network || !account) return;
    if (!isAddress(address)) {
      setStatus({ kind: 'error', text: 'Enter a valid ERC-20 token address.' });
      return;
    }
    setStatus({ kind: 'pending', text: `Loading ${label} and wrapper state...` });
    try {
      const meta = await getTokenMetadata(network, address);
      const wrapper = await getWrapperAddress(network, meta.address);
      setToken(meta);
      setTokenAddress(meta.address);
      setRevealedBalance(null);
      setClaimStates({});
      await refreshTokenState(meta, network, account, wrapper);
      setStatus({ kind: 'success', text: wrapper ? `${meta.symbol} loaded with wrapper.` : `${meta.symbol} loaded. Wrapper not deployed yet.` });
    } catch (error) {
      clearTokenState();
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : `${label} load failed.` });
    }
  };

  const handleConnect = async () => {
    const activeProvider = provider || (await detectProvider())?.provider || null;
    if (!activeProvider) return;
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet connection approval...' });
    try {
      const accounts = await connectNixWallet(activeProvider);
      await syncWalletState(activeProvider, accounts);
      setStatus({ kind: 'success', text: 'Connected. NixWallet will handle all confirmations.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Connection rejected.' });
    }
  };

  const handleSwitchNetwork = async (target: DappNetwork) => {
    if (!provider) return;
    setStatus({ kind: 'pending', text: `Waiting for NixWallet to switch to ${target.name}...` });
    try {
      await switchChain(provider, target.chainHex);
      setChainId(target.chainId);
      clearTokenState();
      setTokenAddress('');
      setStatus({ kind: 'success', text: `Switched to ${target.name}.` });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Network switch rejected.' });
    }
  };

  const handleLoadToken = async () => {
    if (tokenAddress.trim().toLowerCase() === 'native') {
      await loadNativeEth();
      return;
    }
    await loadTokenByAddress(tokenAddress, 'custom token');
  };

  const handleCreateWrapper = async () => {
    if (!provider || !network || !token) return;
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to approve wrapper creation...' });
    try {
      const signer = await getInjectedSigner(provider, network);
      const wrapper = await getOrCreateWrapper(network, signer, token.address);
      setWrapperAddress(wrapper);
      await refreshTokenState(token, network, account, wrapper);
      addActivity('Wrapper ready', wrapper);
      setStatus({ kind: 'success', text: 'Wrapper ready.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Wrapper creation failed.' });
    }
  };

  const parsedPublicTransferAmount = useMemo(() => {
    try {
      if (!token || !publicTransferAmount) return null;
      return parseUnits(publicTransferAmount, token.decimals);
    } catch {
      return null;
    }
  }, [publicTransferAmount, token]);

  const parsedWrapAmount = useMemo(() => {
    try {
      if (!token || !wrapAmount) return null;
      return parseUnits(wrapAmount, token.decimals);
    } catch {
      return null;
    }
  }, [wrapAmount, token]);

  const parsedConfidentialTransferAmount = useMemo(() => {
    try {
      if (!token || !confidentialTransferAmount) return null;
      return parseUnits(confidentialTransferAmount, confidentialDecimals);
    } catch {
      return null;
    }
  }, [confidentialTransferAmount, token, confidentialDecimals]);

  const parsedUnwrapAmount = useMemo(() => {
    try {
      if (!token || !unwrapAmount) return null;
      return parseUnits(unwrapAmount, confidentialDecimals);
    } catch {
      return null;
    }
  }, [unwrapAmount, token, confidentialDecimals]);

  const handlePublicTransfer = async () => {
    if (!provider || !network || !token || !parsedPublicTransferAmount || !publicTransferTo) return;
    if (!isAddress(publicTransferTo)) {
      setStatus({ kind: 'error', text: 'Enter a valid public transfer recipient.' });
      return;
    }
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to confirm public token transfer...' });
    try {
      const signer = await getInjectedSigner(provider, network);
      await transferToken(network, signer, token.address, publicTransferTo, parsedPublicTransferAmount);
      await refreshTokenState();
      addActivity('Public transfer', `${publicTransferAmount} ${token.symbol} to ${short(publicTransferTo)}`);
      setStatus({ kind: 'success', text: 'Public transfer confirmed.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Public transfer failed.' });
    }
  };

  const handleApprove = async () => {
    if (!provider || !network || !token || !wrapperAddress || !parsedWrapAmount) return;
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to approve token spending...' });
    try {
      const signer = await getInjectedSigner(provider, network);
      await approveWrapper(network, signer, token.address, wrapperAddress, parsedWrapAmount);
      await refreshTokenState();
      addActivity('Approved wrapper', `${wrapAmount} ${token.symbol}`);
      setStatus({ kind: 'success', text: 'Approval confirmed.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Approval failed.' });
    }
  };

  const handleShield = async () => {
    if (!provider || !network || !token || !wrapperAddress || !parsedWrapAmount || !account) return;
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to confirm wrap transaction...' });
    try {
      const signer = await getInjectedSigner(provider, network);
      if (isNativeTokenAddress(token.address)) {
        await shieldNative(network, signer, account, parsedWrapAmount);
        addActivity('Wrapped native ETH', `${wrapAmount} ETH → cETH`);
      } else {
        await shield(network, signer, wrapperAddress, account, parsedWrapAmount);
        addActivity('Wrapped token', `${wrapAmount} ${token.symbol}`);
      }
      await refreshTokenState();
      setStatus({ kind: 'success', text: 'Wrap transaction confirmed.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Wrap failed.' });
    }
  };

  const handleConfidentialTransfer = async () => {
    if (!provider || !network || !wrapperAddress || !confidentialTransferTo || !encryptedTransfer.ctHash || !encryptedTransfer.signature) return;
    if (!isAddress(confidentialTransferTo)) {
      setStatus({ kind: 'error', text: 'Enter a valid confidential transfer recipient.' });
      return;
    }
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to confirm confidential transfer...' });
    try {
      const signer = await getInjectedSigner(provider, network);
      await confidentialTransfer(network, signer, wrapperAddress, confidentialTransferTo, {
        ctHash: encryptedTransfer.ctHash,
        securityZone: Number(encryptedTransfer.securityZone || 0),
        utype: Number(encryptedTransfer.utype || 4),
        signature: encryptedTransfer.signature,
      });
      await refreshTokenState();
      addActivity('Confidential transfer', short(confidentialTransferTo));
      setStatus({ kind: 'success', text: 'Confidential transfer confirmed.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Confidential transfer failed.' });
    }
  };

  const handleGenerateEncryptedTransfer = async () => {
    if (!provider || !network || !account || !parsedConfidentialTransferAmount) return;
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to sign CoFHE encryption/permit data if requested...' });
    setIsGeneratingEncryptedTransfer(true);
    setEncryptedTransfer({
      ctHash: '',
      securityZone: '0',
      utype: '4',
      signature: '',
    });
    try {
      const encrypted = await encryptAmount64(provider, network, account, parsedConfidentialTransferAmount);
      setEncryptedTransfer({
        ctHash: String(encrypted.ctHash),
        securityZone: String(encrypted.securityZone ?? 0),
        utype: String(encrypted.utype),
        signature: encrypted.signature,
      });
      setStatus({ kind: 'success', text: 'Encrypted amount generated. You can now send the confidential transfer.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Encryption failed.' });
    } finally {
      setIsGeneratingEncryptedTransfer(false);
    }
  };

  const handleRevealBalance = async () => {
    if (!provider || !network || !account || !encryptedBalance) return;
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to approve CoFHE view permit...' });
    try {
      const cofheProvider = provider.nixWalletSupportsTypedData
        ? provider
        : (await discoverTypedDataNixWallet(1500))?.provider;
      if (!cofheProvider) {
        throw new Error('The selected NixWallet provider is an older build without typed-data signing. Disable old NixWallet copies, reload the extension from extension/dist, then refresh this page.');
      }
      const value = await decryptForView(cofheProvider, network, account, encryptedBalance);
      setRevealedBalance(value);
      addActivity('Revealed confidential balance', formatUnits(value, confidentialDecimals));
      setStatus({ kind: 'success', text: 'Confidential balance revealed locally in the dApp.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Reveal failed.' });
    }
  };

  const handleRequestUnshield = async () => {
    if (!provider || !network || !token || !wrapperAddress || !parsedUnwrapAmount || !account) return;
    const recipient = unshieldTo || account;
    if (!isAddress(recipient)) {
      setStatus({ kind: 'error', text: 'Enter a valid unwrap recipient.' });
      return;
    }
    if (!encryptedBalance) {
      setStatus({ kind: 'error', text: 'No confidential balance found for this wrapper yet. Wrap tokens first.' });
      return;
    }
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to confirm unwrap request...' });
    try {
      const signer = await getInjectedSigner(provider, network);
      await requestUnshield(network, signer, wrapperAddress, account, recipient, parsedUnwrapAmount);
      await refreshTokenState();
      addActivity('Requested unwrap', `${unwrapAmount} c${token.symbol}`);
      setStatus({ kind: 'success', text: 'Unwrap requested. Use “Prepare & claim” on the pending claim below when it appears.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Unwrap request failed.' });
    }
  };

  const handleFinalizeClaim = async (claim: PendingClaim) => {
    if (!provider || !network || !wrapperAddress || !account || !token) return;
    const current = claimStates[claim.ctHash]?.stage;
    if (current === 'preparing' || current === 'claiming') return;

    updateClaimState(claim.ctHash, { stage: 'preparing', message: 'Waiting for CoFHE threshold decrypt...' });
    setStatus({ kind: 'pending', text: 'Preparing claim proof in NixWallet...' });
    try {
      const result = await withDecryptRetry(
        () => decryptForTx(provider, network, account, claim.ctHash),
        {
          maxAttempts: 15,
          onRetry: (attempt, maxAttempts) => {
            const retryText = `Syncing with threshold node (${attempt}/${maxAttempts})...`;
            setStatus({ kind: 'pending', text: retryText });
            updateClaimState(claim.ctHash, { stage: 'preparing', message: retryText });
          },
        },
      );

      const formatted = formatUnits(result.decryptedValue, confidentialDecimals);
      updateClaimState(claim.ctHash, { stage: 'ready', message: `${formatted} ${token.symbol} ready to claim` });
      setStatus({ kind: 'pending', text: 'Waiting for NixWallet to confirm claim transaction...' });
      updateClaimState(claim.ctHash, { stage: 'claiming', message: 'Submitting claim transaction...' });

      const signer = await getInjectedSigner(provider, network);
      await claimUnshielded(network, signer, wrapperAddress, claim.ctHash, result.decryptedValue, result.signature);
      await refreshTokenState();
      updateClaimState(claim.ctHash, { stage: 'done', message: 'Claim confirmed' });
      addActivity('Claim finalized', `${formatted} ${token.symbol}`);
      setStatus({ kind: 'success', text: `Claim confirmed. ${formatted} ${token.symbol} returned to your public balance.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Claim failed.';
      updateClaimState(claim.ctHash, { stage: 'error', message });
      setStatus({ kind: 'error', text: message });
    }
  };

  const handleRequestUnshieldAndFinalize = async () => {
    if (!provider || !network || !token || !wrapperAddress || !parsedUnwrapAmount || !account) return;
    setIsFinalizingUnwrap(true);
    try {
      await handleRequestUnshield();
      await refreshTokenState();
      const pending = await getPendingClaims(network, wrapperAddress, account);
      setClaims(pending);
      const latest = pending[pending.length - 1];
      if (!latest) {
        setStatus({ kind: 'success', text: 'Unwrap requested. Pending claim not visible yet — refresh and finalize in a few seconds.' });
        return;
      }
      await handleFinalizeClaim(latest);
    } finally {
      setIsFinalizingUnwrap(false);
    }
  };

  const needsApproval = !isNativeAsset && parsedWrapAmount !== null && (allowance ?? 0n) < parsedWrapAmount;
  const hasEncryptedTransferPayload = Boolean(encryptedTransfer.ctHash && encryptedTransfer.signature);
  const extensionDetected = Boolean(providerInfo);
  const walletReady = Boolean(provider && account && network);
  const wrapperReady = Boolean(wrapperAddress);
  const hasConfidentialBalance = Boolean(encryptedBalance && encryptedBalance !== ZeroHash);
  const actionTabs: { id: ActionTab; label: string }[] = [
    { id: 'transfer', label: 'Public Transfer' },
    { id: 'wrap', label: 'Wrap' },
    { id: 'confidential', label: 'Confidential Transfer' },
    { id: 'unwrap', label: 'Unwrap / Claim' },
  ];

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="mx-auto max-w-6xl flex items-center justify-between gap-4">
          <div>
            <div className="text-cyan-300 text-xs uppercase tracking-[0.35em] font-bold">NixWallet DApp</div>
            <h1 className="text-3xl font-black tracking-tight">Public + Confidential Token Manager</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <AboutMenu />
            <button type="button" onClick={handleConnect} className="px-4 py-3 bg-cyan-300 text-slate-950 font-bold uppercase tracking-widest text-xs">
              {account ? short(account) : 'Connect NixWallet'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6 space-y-4">
        {!extensionDetected && (
          <div className="install-banner">
            <strong>Install NixWallet first.</strong> This site is an external dApp—it does not hold keys or show transaction approvals.
            Install the{' '}
            <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">
              NixWallet Chrome extension
            </a>
            , load it from <code className="font-mono text-cyan-300">extension/dist</code> in dev, then refresh this page and click <strong>Connect NixWallet</strong>.
          </div>
        )}

        <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <section className="space-y-4">
          <Card title="Wallet">
            <Info label="Wallet" value={providerInfo ? providerInfo.info.name : 'Not detected'} />
            <Info label="Account" value={short(account)} />
            <Info label="Network" value={network ? network.name : chainId ? `Unsupported (${chainId})` : 'Not connected'} />
            <Info label="Chain ID" value={chainId ? String(chainId) : 'Not connected'} />
            <Info label="Provider" value={provider?.nixWalletBuild || 'legacy / unknown'} />
            <div className="grid gap-2 pt-2">
              {SUPPORTED_NETWORKS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSwitchNetwork(item)}
                  disabled={!provider}
                  className={`choice-button w-full px-3 py-2 text-left text-xs uppercase tracking-widest ${network?.id === item.id ? 'selected' : ''}`}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Status">
            <div className={`text-sm ${status.kind === 'error' ? 'text-red-300' : status.kind === 'success' ? 'text-emerald-300' : status.kind === 'pending' ? 'text-amber-300' : 'text-slate-300'}`}>
              {status.text}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mt-3">
              This dApp starts actions. NixWallet shows the trusted confirmation modal, transaction details, and approve/reject controls.
            </p>
          </Card>
        </section>

        <section className="space-y-4">
          <Card title="Assets">
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Native ETH (cETH) or ERC-20 stablecoins
            </p>
            <div className="choice-section-label">Select token</div>
            <button
              type="button"
              onClick={() => void loadNativeEth()}
              disabled={!network || !account || !isNativeWrapperConfigured(network?.id ?? 'sepolia')}
              className={`choice-button mb-3 w-full p-4 ${isNativeAsset ? 'selected' : ''}`}
            >
              <div className="choice-button-body">
                <div className="text-sm font-black">Native ETH → cETH</div>
                <div className="choice-sub text-xs mt-2">shieldNative · confidential transfer · unwrap to ETH</div>
                {network && !isNativeWrapperConfigured(network.id) && (
                  <div className="text-xs text-amber-700 mt-2 font-bold">Wrapper not deployed on this network.</div>
                )}
              </div>
              <span className="choice-button-action">{isNativeAsset ? 'Active' : 'Select'}</span>
            </button>
            {defaultTokens.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-3">
                {defaultTokens.map((item) => {
                  const isSelected = token?.address.toLowerCase() === item.address.toLowerCase();
                  return (
                  <button
                    type="button"
                    key={item.address}
                    onClick={() => loadTokenByAddress(item.address, item.symbol)}
                    disabled={!network || !account}
                    className={`choice-button p-4 ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="choice-button-body">
                      <div className="text-sm font-black">{item.symbol}</div>
                      <div className="choice-sub text-xs mt-2">{item.name}</div>
                      <div className="choice-sub text-xs font-mono mt-2">{short(item.address)}</div>
                    </div>
                    <span className="choice-button-action">{isSelected ? 'Active' : 'Select'}</span>
                  </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-slate-400">
                No default USDT/USDC contracts are configured for this network yet. Switch to Ethereum Sepolia or load a token manually.
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <input
                value={tokenAddress}
                onChange={(event) => setTokenAddress(event.target.value)}
                placeholder="Advanced: ERC-20 token address"
                className="flex-1 bg-slate-950 border border-white/10 px-3 py-3 text-sm font-mono outline-none focus:border-cyan-300"
              />
              <button onClick={handleLoadToken} disabled={!network || !account} className="px-4 py-3 bg-white text-slate-950 font-bold text-xs uppercase tracking-widest disabled:opacity-40">
                Load
              </button>
            </div>
          </Card>

          {!walletReady && (
            <Card title="Getting started">
              <p className="text-sm text-slate-400 leading-relaxed">
                {extensionDetected
                  ? 'Click Connect NixWallet in the header, approve in the extension side panel, pick a testnet, then tap a white asset button below.'
                  : 'Install the NixWallet Chrome extension first (see banner above), refresh, then connect and pick an asset.'}
              </p>
            </Card>
          )}

          {walletReady && !network && (
            <Card title="Unsupported network">
              <p className="text-sm text-amber-300 leading-relaxed">
                Switch to Ethereum Sepolia, Base Sepolia, or Arbitrum Sepolia in NixWallet before loading tokens.
              </p>
            </Card>
          )}

          {token && (
            <Card title={`${token.symbol} Manager`}>
              {!wrapperReady && (
                <div className="mb-4 rounded border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                  {isNativeAsset
                    ? 'Native ETH wrapper is not configured on this network. Use Sepolia or Base Sepolia.'
                    : `No confidential wrapper is deployed for ${token.symbol} on this network yet. Create the wrapper before wrapping, confidential transfers, or unwrap flows.`}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <Panel icon={<Wallet />} title="Public Balance">
                  <div className="text-2xl font-black">{publicBalance !== null ? formatAmountDisplay(publicBalance, token.decimals) : '--'} {token.symbol}</div>
                  <Info label="Token" value={token.address} mono />
                  <Info label="Decimals" value={String(token.decimals)} />
                </Panel>

                <Panel icon={<Shield />} title="Confidential Wrapper">
                  <div className="text-sm">{wrapperAddress ? 'Wrapper deployed' : 'No wrapper yet'}</div>
                  <Info label="Wrapper" value={wrapperAddress ? short(wrapperAddress) : 'Not deployed'} mono />
                  <Info label="ctHash" value={encryptedBalance ? short(encryptedBalance) : 'Not loaded'} mono />
                  <Info label="Revealed" value={revealedBalance !== null ? `${formatAmountDisplay(revealedBalance, confidentialDecimals)} ${isNativeAsset ? 'cETH' : `c${token.symbol}`}` : 'Hidden'} />
                  {!isNativeAsset && (
                    <button onClick={handleCreateWrapper} disabled={!network || !account} className="mt-3 w-full py-2 border border-cyan-300 text-cyan-300 text-xs uppercase tracking-widest font-bold disabled:opacity-40">
                      {wrapperAddress ? 'Refresh Wrapper' : 'Create Wrapper'}
                    </button>
                  )}
                  <button onClick={handleRevealBalance} disabled={!encryptedBalance} className="mt-3 w-full py-2 border border-white/10 text-white text-xs uppercase tracking-widest font-bold disabled:opacity-40">
                    Reveal Confidential Balance
                  </button>
                </Panel>
              </div>

              <div className="mt-5 border border-white/10 p-4 bg-slate-950/60">
                <div className="action-tabs">
                  {actionTabs.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveAction(item.id)}
                      className={`action-tab ${activeAction === item.id ? 'active' : ''}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {activeAction === 'transfer' && !isNativeAsset && (
                  <ActionPanel title={`Transfer Public ${token.symbol}`}>
                    <input
                      value={publicTransferTo}
                      onChange={(event) => setPublicTransferTo(event.target.value)}
                      placeholder="Recipient address"
                      className="action-input font-mono"
                    />
                    <div className="grid md:grid-cols-2 gap-2">
                      <input
                        value={publicTransferAmount}
                        onChange={(event) => setPublicTransferAmount(event.target.value)}
                        placeholder={`Amount in ${token.symbol}`}
                        className="action-input"
                      />
                      <button onClick={handlePublicTransfer} disabled={!parsedPublicTransferAmount || !publicTransferTo} className="action-button secondary">
                        Send Public Transfer
                      </button>
                    </div>
                  </ActionPanel>
                )}

                {activeAction === 'wrap' && (
                  <ActionPanel title="Wrap Public Into Confidential">
                    <div className="grid md:grid-cols-[1fr_auto_auto] gap-2">
                      <input
                        value={wrapAmount}
                        onChange={(event) => setWrapAmount(event.target.value)}
                        placeholder={`Amount in ${token.symbol}`}
                        className="action-input"
                      />
                      <button onClick={handleApprove} disabled={!wrapperAddress || !parsedWrapAmount || !needsApproval} className="action-button outline">
                        Approve
                      </button>
                      <button onClick={handleShield} disabled={!wrapperAddress || !parsedWrapAmount || needsApproval} className="action-button primary">
                        Wrap
                      </button>
                    </div>
                    <div className="mt-3 text-xs text-slate-400">
                      {needsApproval ? 'Approval is needed before wrapping.' : parsedWrapAmount ? 'Ready to wrap after NixWallet confirmation.' : 'Enter an amount.'}
                    </div>
                  </ActionPanel>
                )}

                {activeAction === 'confidential' && (
                  <ActionPanel title="Confidential Transfer" description="Generate an encrypted amount with CoFHE, then NixWallet confirms the wrapper transaction.">
                    <input value={confidentialTransferTo} onChange={(event) => setConfidentialTransferTo(event.target.value)} placeholder="Recipient address" className="action-input font-mono" />
                    <input value={confidentialTransferAmount} onChange={(event) => setConfidentialTransferAmount(event.target.value)} placeholder={`Amount in confidential ${token.symbol}`} className="action-input" />
                    {isGeneratingEncryptedTransfer && (
                      <div className="generating-panel" role="status" aria-live="polite">
                        <span className="generating-spinner" />
                        <span>Generating encrypted payload with CoFHE. Approve any NixWallet prompts and keep this page open.</span>
                      </div>
                    )}
                    {hasEncryptedTransferPayload && !isGeneratingEncryptedTransfer && (
                      <div className="generated-panel">
                        Encrypted payload ready. Review the read-only values below, then send the confidential transfer.
                      </div>
                    )}
                    <input value={encryptedTransfer.ctHash} readOnly placeholder="Encrypted ctHash will appear here" className="action-input readonly font-mono" />
                    <div className="grid md:grid-cols-2 gap-2">
                      <input value={encryptedTransfer.securityZone} readOnly placeholder="Security zone" className="action-input readonly" />
                      <input value={encryptedTransfer.utype} readOnly placeholder="utype" className="action-input readonly" />
                    </div>
                    <input value={encryptedTransfer.signature} readOnly placeholder="Encrypted input signature will appear here" className="action-input readonly font-mono" />
                    <button onClick={handleGenerateEncryptedTransfer} disabled={!parsedConfidentialTransferAmount || isGeneratingEncryptedTransfer} className="action-button outline">
                      {isGeneratingEncryptedTransfer ? 'Generating...' : hasEncryptedTransferPayload ? 'Regenerate Encrypted Amount' : 'Generate Encrypted Amount'}
                    </button>
                    <button onClick={handleConfidentialTransfer} disabled={isGeneratingEncryptedTransfer || !wrapperAddress || !confidentialTransferTo || !encryptedTransfer.ctHash || !encryptedTransfer.signature} className="action-button primary">
                      Send Confidential Transfer
                    </button>
                  </ActionPanel>
                )}

                {activeAction === 'unwrap' && (
                  <ActionPanel
                    title="Unwrap / Claim"
                    description="Request an unwrap, then finalize the pending claim. CoFHE proof generation and the claim transaction are both confirmed in NixWallet."
                  >
                    {!hasConfidentialBalance && (
                      <div className="text-xs text-amber-200 border border-amber-400/20 bg-amber-400/10 px-3 py-2">
                        Wrap tokens first to create a confidential balance before requesting an unwrap.
                      </div>
                    )}
                    <input value={unshieldTo} onChange={(event) => setUnshieldTo(event.target.value)} placeholder={`Unwrap recipient (defaults to ${short(account)})`} className="action-input font-mono" />
                    <input value={unwrapAmount} onChange={(event) => setUnwrapAmount(event.target.value)} placeholder={`Amount in confidential ${token.symbol}`} className="action-input" />
                    <div className="grid md:grid-cols-2 gap-2">
                      <button onClick={handleRequestUnshield} disabled={!wrapperAddress || !parsedUnwrapAmount || !hasConfidentialBalance} className="action-button outline">
                        Request Unwrap
                      </button>
                      <button onClick={handleRequestUnshieldAndFinalize} disabled={!wrapperAddress || !parsedUnwrapAmount || !hasConfidentialBalance || isFinalizingUnwrap} className="action-button primary">
                        {isFinalizingUnwrap ? 'Unwrapping...' : 'Unwrap & Auto-Claim'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">
                      Auto-claim requests the unwrap, waits for the pending claim, prepares the CoFHE proof, and submits the claim in one guided flow.
                    </p>
                  </ActionPanel>
                )}
              </div>

              <div className="mt-5 border border-white/10 p-4 bg-slate-950/60">
                <h3 className="font-bold uppercase tracking-widest text-xs text-cyan-300 mb-3">Pending Claims</h3>
                {claims.length === 0 ? (
                  <div className="text-sm text-slate-400">
                    {wrapperReady
                      ? 'No pending unwrap claims yet. Request an unwrap above, then finalize it here.'
                      : 'Deploy the wrapper first to load pending claims.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {claims.map((claim) => (
                      <div key={claim.ctHash} className="border border-white/10 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-xs font-mono text-white">{short(claim.ctHash)}</div>
                            <div className="text-[11px] text-slate-400 mt-1">
                              Requested {formatUnits(claim.requestedAmount, token.decimals)} {token.symbol}
                            </div>
                          </div>
                        <button
                          onClick={() => handleFinalizeClaim(claim)}
                          disabled={claimStates[claim.ctHash]?.stage === 'preparing' || claimStates[claim.ctHash]?.stage === 'claiming' || claimStates[claim.ctHash]?.stage === 'done'}
                          className="text-cyan-300 uppercase tracking-widest text-[11px] font-bold disabled:opacity-40"
                        >
                          {claimStates[claim.ctHash]?.stage === 'done'
                            ? 'Claimed'
                            : claimStates[claim.ctHash]?.stage === 'preparing' || claimStates[claim.ctHash]?.stage === 'claiming'
                              ? 'Working...'
                              : 'Prepare & claim'}
                        </button>
                        </div>
                        {claimStates[claim.ctHash]?.message && (
                          <div className={`text-[11px] ${claimStates[claim.ctHash]?.stage === 'error' ? 'text-red-300' : 'text-slate-400'}`}>
                            {claimStates[claim.ctHash]?.message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card title="Next Actions">
            <div className="grid md:grid-cols-3 gap-3">
              <Feature icon={<CheckCircle2 />} title="Defaults" text="USDT and USDC are available by default on Ethereum Sepolia." />
              <Feature icon={<ArrowRightLeft />} title="Actions" text="Transfer publicly, wrap into confidential balance, unwrap, claim, and send confidentially." />
              <Feature icon={<ExternalLink />} title="NixWallet" text="All signatures and transactions are confirmed in-wallet." />
            </div>
          </Card>

          <Card title="Activity">
            {activities.length === 0 ? (
              <div className="text-sm text-slate-400">No dApp activity yet.</div>
            ) : (
              <div className="space-y-2">
                {activities.map((item) => (
                  <div key={item.id} className="border border-white/10 p-3">
                    <div className="text-sm font-bold">{item.label}</div>
                    <div className="text-xs text-slate-400 font-mono break-all">{item.detail}</div>
                    <div className="text-xs text-slate-400 mt-2">{new Date(item.createdAt).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
        </div>
      </main>
    </div>
  );
}

function AboutMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="about-menu" ref={rootRef}>
      <button
        type="button"
        className={`about-menu-trigger ${open ? 'open' : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
      >
        About
        <ChevronDown className="about-menu-chevron" aria-hidden />
      </button>
      {open && (
        <div className="about-menu-panel" role="dialog" aria-label="About NixWallet companion dApp">
          <div className="about-menu-title">About this companion dApp</div>
          <p className="about-menu-lead">
            This site <strong>showcases</strong> how any external web app can plug into{' '}
            <strong>NixWallet</strong>—the confidential Chrome extension wallet for Fhenix FHERC20 flows. It
            demonstrates real integration patterns (injected provider and WalletConnect) without building a
            separate signing UI.
          </p>
          <p className="about-menu-note">
            This dApp never stores private keys. Every connect, approve, sign, wrap, confidential transfer, and
            claim is confirmed inside the NixWallet side panel.
          </p>
          <div className="about-menu-body">
            <div className="about-menu-col">
              <div className="about-menu-kicker">What it showcases</div>
              <ul className="about-menu-list">
                <li>Native ETH → cETH via shieldNative on Sepolia testnets</li>
                <li>ERC-20 public transfer, wrap, confidential send, unwrap, and claim</li>
                <li>EIP-6963 / EIP-1193 discovery and WalletConnect v2 pairing</li>
                <li>Transactions submitted here appear in NixWallet Activity</li>
              </ul>
            </div>
            <div className="about-menu-col">
              <div className="about-menu-kicker">Links</div>
              <div className="about-menu-links" role="none">
                <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">
                  Install NixWallet <ExternalLink className="about-menu-link-icon" aria-hidden />
                </a>
                <a href={NIXWALLET_SITE_URL} target="_blank" rel="noopener noreferrer">
                  NixWallet site <ExternalLink className="about-menu-link-icon" aria-hidden />
                </a>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  GitHub repo <ExternalLink className="about-menu-link-icon" aria-hidden />
                </a>
                <a href={DAPP_SOURCE_URL} target="_blank" rel="noopener noreferrer">
                  dApp source <ExternalLink className="about-menu-link-icon" aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white/[0.04] border border-white/10 p-5 shadow-2xl">
      <h2 className="text-sm uppercase tracking-[0.25em] font-black text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`text-right break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function Panel({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="border border-white/10 bg-slate-950/60 p-4">
      <div className="flex items-center gap-2 text-cyan-300 mb-3">
        <span className="[&>svg]:w-4 [&>svg]:h-4">{icon}</span>
        <span className="text-xs uppercase tracking-widest font-bold">{title}</span>
      </div>
      {children}
    </div>
  );
}

function ActionPanel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="font-bold uppercase tracking-widest text-xs text-cyan-300 mb-3">{title}</h3>
      {description && <p className="text-xs text-slate-400 mb-3">{description}</p>}
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="border border-white/10 p-3">
      <div className="flex items-center gap-2 text-cyan-300 text-sm font-bold">
        <span className="[&>svg]:w-4 [&>svg]:h-4">{icon}</span>
        {title}
      </div>
      <p className="text-xs text-slate-400 mt-2 leading-relaxed">{text}</p>
    </div>
  );
}
