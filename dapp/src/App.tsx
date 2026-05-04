import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRightLeft, CheckCircle2, ExternalLink, Shield, Wallet } from 'lucide-react';
import { formatUnits, isAddress, parseUnits } from 'ethers';
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
  getOrCreateWrapper,
  getPendingClaims,
  getPublicBalance,
  getTokenMetadata,
  getWrapperAddress,
  requestUnshield,
  shield,
  transferToken,
  type PendingClaim,
  type TokenMetadata,
} from './lib/contracts';
import { getNetworkByChainId, parseChainId, SUPPORTED_NETWORKS, type DappNetwork } from './config/networks';
import { getDefaultTokens } from './config/tokens';
import { decryptForTx, decryptForView, encryptAmount64 } from './lib/cofheBrowser';

type Status = { kind: 'idle' | 'success' | 'error' | 'pending'; text: string };
type Activity = { id: string; label: string; detail: string; createdAt: number };
type ActionTab = 'transfer' | 'wrap' | 'confidential' | 'unwrap';

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
  const [claimProof, setClaimProof] = useState({
    requestId: '',
    decryptedValue: '',
    signature: '',
  });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: 'Connect NixWallet to begin.' });
  const [activeAction, setActiveAction] = useState<ActionTab>('wrap');

  const network = useMemo(() => getNetworkByChainId(chainId), [chainId]);
  const provider = providerInfo?.provider || null;
  const defaultTokens = useMemo(() => getDefaultTokens(network), [network]);

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
    const [balance, wrapper] = await Promise.all([
      getPublicBalance(nextNetwork, nextToken.address, nextAccount),
      nextWrapper ? Promise.resolve(nextWrapper) : getWrapperAddress(nextNetwork, nextToken.address),
    ]);
    setPublicBalance(balance);
    setWrapperAddress(wrapper);

    if (wrapper) {
      const [nextAllowance, ctHash, pendingClaims] = await Promise.all([
        getAllowance(nextNetwork, nextToken.address, nextAccount, wrapper),
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
    setClaimProof({ requestId: '', decryptedValue: '', signature: '' });
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
      setClaimProof({ requestId: '', decryptedValue: '', signature: '' });
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
    await loadTokenByAddress(tokenAddress, 'custom token');
  };

  const handleCreateWrapper = async () => {
    if (!provider || !network || !token) return;
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to approve wrapper creation...' });
    try {
      const signer = await getInjectedSigner(provider);
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
      return parseUnits(confidentialTransferAmount, token.decimals);
    } catch {
      return null;
    }
  }, [confidentialTransferAmount, token]);

  const parsedUnwrapAmount = useMemo(() => {
    try {
      if (!token || !unwrapAmount) return null;
      return parseUnits(unwrapAmount, token.decimals);
    } catch {
      return null;
    }
  }, [unwrapAmount, token]);

  const handlePublicTransfer = async () => {
    if (!provider || !network || !token || !parsedPublicTransferAmount || !publicTransferTo) return;
    if (!isAddress(publicTransferTo)) {
      setStatus({ kind: 'error', text: 'Enter a valid public transfer recipient.' });
      return;
    }
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to confirm public token transfer...' });
    try {
      const signer = await getInjectedSigner(provider);
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
      const signer = await getInjectedSigner(provider);
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
      const signer = await getInjectedSigner(provider);
      await shield(network, signer, wrapperAddress, account, parsedWrapAmount);
      await refreshTokenState();
      addActivity('Wrapped token', `${wrapAmount} ${token.symbol}`);
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
      const signer = await getInjectedSigner(provider);
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
      addActivity('Revealed confidential balance', formatUnits(value, token?.decimals ?? 6));
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
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to confirm unwrap request...' });
    try {
      const signer = await getInjectedSigner(provider);
      await requestUnshield(network, signer, wrapperAddress, account, recipient, parsedUnwrapAmount);
      await refreshTokenState();
      addActivity('Requested unwrap', `${unwrapAmount} ${token.symbol}`);
      setStatus({ kind: 'success', text: 'Unwrap requested. Finalize once CoFHE proof is available.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Unwrap request failed.' });
    }
  };

  const handleClaim = async () => {
    if (!provider || !network || !wrapperAddress || !claimProof.requestId || !claimProof.decryptedValue || !claimProof.signature) return;
    setStatus({ kind: 'pending', text: 'Waiting for NixWallet to confirm claim transaction...' });
    try {
      const signer = await getInjectedSigner(provider);
      await claimUnshielded(
        network,
        signer,
        wrapperAddress,
        claimProof.requestId,
        BigInt(claimProof.decryptedValue),
        claimProof.signature,
      );
      await refreshTokenState();
      addActivity('Claim finalized', short(claimProof.requestId));
      setStatus({ kind: 'success', text: 'Claim confirmed.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Claim failed.' });
    }
  };

  const handlePrepareClaimProof = async (claim: PendingClaim) => {
    if (!provider || !network || !account) return;
    setStatus({ kind: 'pending', text: 'Waiting for CoFHE decrypt-for-tx result...' });
    try {
      const result = await decryptForTx(provider, network, account, claim.ctHash);
      setClaimProof({
        requestId: claim.ctHash,
        decryptedValue: result.decryptedValue.toString(),
        signature: result.signature,
      });
      addActivity('Prepared claim proof', short(claim.ctHash));
      setStatus({ kind: 'success', text: 'Claim proof prepared. Confirm the claim transaction in NixWallet.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Claim proof preparation failed.' });
    }
  };

  const needsApproval = parsedWrapAmount !== null && (allowance ?? 0n) < parsedWrapAmount;
  const hasEncryptedTransferPayload = Boolean(encryptedTransfer.ctHash && encryptedTransfer.signature);
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
          <button onClick={handleConnect} className="px-4 py-3 bg-cyan-300 text-slate-950 font-bold uppercase tracking-widest text-xs">
            {account ? short(account) : 'Connect NixWallet'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6 grid lg:grid-cols-[360px_1fr] gap-6">
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
                  onClick={() => handleSwitchNetwork(item)}
                  disabled={!provider}
                  className={`px-3 py-2 border text-left text-xs uppercase tracking-widest ${network?.id === item.id ? 'border-cyan-300 text-cyan-300' : 'border-white/10 text-slate-300'}`}
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
          <Card title="Stablecoins">
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Select token
            </p>
            {defaultTokens.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-3">
                {defaultTokens.map((item) => (
                  <button
                    key={item.address}
                    onClick={() => loadTokenByAddress(item.address, item.symbol)}
                    disabled={!network || !account}
                    className={`p-4 border text-left disabled:opacity-40 ${token?.address.toLowerCase() === item.address.toLowerCase() ? 'border-cyan-300 text-cyan-300' : 'border-white/10 text-white'}`}
                  >
                    <div className="text-sm font-black">{item.symbol}</div>
                    <div className="text-xs text-slate-400 mt-2">{item.name}</div>
                    <div className="text-xs text-slate-400 font-mono mt-2">{short(item.address)}</div>
                  </button>
                ))}
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

          {token && (
            <Card title={`${token.symbol} Manager`}>
              <div className="grid md:grid-cols-2 gap-4">
                <Panel icon={<Wallet />} title="Public Balance">
                  <div className="text-2xl font-black">{publicBalance !== null ? formatUnits(publicBalance, token.decimals) : '--'} {token.symbol}</div>
                  <Info label="Token" value={token.address} mono />
                  <Info label="Decimals" value={String(token.decimals)} />
                </Panel>

                <Panel icon={<Shield />} title="Confidential Wrapper">
                  <div className="text-sm">{wrapperAddress ? 'Wrapper deployed' : 'No wrapper yet'}</div>
                  <Info label="Wrapper" value={wrapperAddress ? short(wrapperAddress) : 'Not deployed'} mono />
                  <Info label="ctHash" value={encryptedBalance ? short(encryptedBalance) : 'Not loaded'} mono />
                  <Info label="Revealed" value={revealedBalance !== null ? formatUnits(revealedBalance, token.decimals) : 'Hidden'} />
                  <button onClick={handleCreateWrapper} disabled={!network || !account} className="mt-3 w-full py-2 border border-cyan-300 text-cyan-300 text-xs uppercase tracking-widest font-bold disabled:opacity-40">
                    {wrapperAddress ? 'Refresh Wrapper' : 'Create Wrapper'}
                  </button>
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

                {activeAction === 'transfer' && (
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
                  <ActionPanel title="Unwrap / Claim">
                    <input value={unshieldTo} onChange={(event) => setUnshieldTo(event.target.value)} placeholder={`Unwrap recipient (defaults to ${short(account)})`} className="action-input font-mono" />
                    <input value={unwrapAmount} onChange={(event) => setUnwrapAmount(event.target.value)} placeholder={`Amount in confidential ${token.symbol}`} className="action-input" />
                    <button onClick={handleRequestUnshield} disabled={!wrapperAddress || !parsedUnwrapAmount} className="action-button outline">
                      Request Unwrap
                    </button>
                    <div className="grid gap-2 mt-5">
                      <input value={claimProof.requestId} onChange={(event) => setClaimProof((prev) => ({ ...prev, requestId: event.target.value }))} placeholder="Claim request ID / ctHash" className="action-input font-mono" />
                      <input value={claimProof.decryptedValue} onChange={(event) => setClaimProof((prev) => ({ ...prev, decryptedValue: event.target.value }))} placeholder="Decrypted value" className="action-input" />
                      <input value={claimProof.signature} onChange={(event) => setClaimProof((prev) => ({ ...prev, signature: event.target.value }))} placeholder="CoFHE decryption proof/signature" className="action-input font-mono" />
                      <button onClick={handleClaim} disabled={!wrapperAddress || !claimProof.requestId || !claimProof.decryptedValue || !claimProof.signature} className="action-button secondary">
                        Finalize Claim
                      </button>
                    </div>
                  </ActionPanel>
                )}
              </div>

              <div className="mt-5 border border-white/10 p-4 bg-slate-950/60">
                <h3 className="font-bold uppercase tracking-widest text-xs text-cyan-300 mb-3">Pending Claims</h3>
                {claims.length === 0 ? (
                  <div className="text-sm text-slate-400">No pending claims loaded.</div>
                ) : (
                  <div className="space-y-2">
                    {claims.map((claim) => (
                      <div key={claim.ctHash} className="text-xs font-mono border border-white/10 p-2 flex items-center justify-between gap-2">
                        <span>{short(claim.ctHash)}</span>
                        <button onClick={() => handlePrepareClaimProof(claim)} className="text-cyan-300 uppercase tracking-widest">
                          {claim.claimed ? 'Claimed' : 'Prepare proof'}
                        </button>
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
      </main>
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
