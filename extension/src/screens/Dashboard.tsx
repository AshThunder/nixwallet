import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ArrowRightLeft, ArrowUpRight, ArrowDownRight,
  Lock, Copy, Check, Settings, LogOut, RefreshCw, Eye, Loader2, X, ExternalLink, ChevronDown, Plus, AlertCircle,
} from 'lucide-react';
import TokenIcon from '../components/TokenIcon';
import TestnetFaucetLink from '../components/TestnetFaucetLink';
import { getNativeEthFaucetUrl, getStablecoinFaucetUrl } from '../lib/testnetFaucets';
import { mergePrivateBalancesOnFetch, resetPrivateBalanceState } from '../lib/privateBalanceState';
import { shortenAddress, formatBalance, formatUnitsDisplay, getProvider, FHENIX_NETWORKS } from '../lib/wallet';
import type { NetworkId } from '../lib/wallet';
import { getWrapperAddress, isNativeWrapperConfigured, NATIVE_TOKEN_METADATA } from '../lib/contracts';
import { initCofheClient, decryptForView, FheTypes } from '../lib/cofhe';
import { getActivities, type Activity } from '../lib/activity';
import { ensureDefaults, type TokenMetadata } from '../lib/tokens';
import { getNativeEthPrice, getUsdPrices, type TokenPriceResult } from '../lib/prices';
import { ethers } from 'ethers';
import Discover from './Discover';
import ThemeToggle from '../components/ThemeToggle';
import AccountPicker from '../components/AccountPicker';

interface Props {
  address: string;
  privateKey: string;
  mnemonic?: string;
  accountIndex?: number;
  importedAccounts?: { address: string; privateKey: string; name?: string }[];
  network: { id: string; name: string; symbol: string; chainId: number; explorer: string; [k: string]: unknown };
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigate: (screen: string, tokenData?: { symbol: string; address: string; decimals?: number; sendMode?: 'public' | 'private' }) => void;
  onAccountChange?: (arg: number | string) => void;
  onImportAccount?: (acc: { address: string; privateKey: string; name?: string }, password: string) => Promise<boolean>;
  onNetworkChange?: (id: NetworkId) => void;
  onLock: () => void;
}



export default function Dashboard({
  address,
  privateKey: _pk,
  mnemonic,
  accountIndex,
  importedAccounts,
  network,
  theme,
  onToggleTheme,
  onNavigate,
  onAccountChange,
  onImportAccount,
  onNetworkChange,
  onLock
}: Props) {
  const [activeTab, setActiveTab] = useState<'tokens' | 'activity' | 'discover'>('tokens');
  const [ethBalance, setEthBalance] = useState('0.0000');
  const [ethPrivateBalance, setEthPrivateBalance] = useState<string | null>('***');
  const [decryptingEth, setDecryptingEth] = useState(false);
  const [customTokenBalances, setCustomTokenBalances] = useState<Record<string, string>>({});
  const [customPrivateBalances, setCustomPrivateBalances] = useState<Record<string, string | null>>({});
  const [decryptingTokens, setDecryptingTokens] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [accountCount, setAccountCount] = useState(1);
  const [showTokenPicker, setShowTokenPicker] = useState<{ open: boolean; action: 'send' | 'wrap' }>({ open: false, action: 'send' });
  const [showNetworkPicker, setShowNetworkPicker] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [ethUsdPrice, setEthUsdPrice] = useState<number | null>(null);
  const [tokenPrices, setTokenPrices] = useState<Record<string, TokenPriceResult>>({});
  const [pricesLastUpdated, setPricesLastUpdated] = useState<number | null>(null);
  const [pricesStale, setPricesStale] = useState(false);
  const networkPickerRef = useRef<HTMLDivElement | null>(null);
  const activeAddressRef = useRef(address);
  activeAddressRef.current = address;

  const key = `custom_tokens_${network.id}`;
  const [customMetadata, setCustomMetadata] = useState<TokenMetadata[]>([]);

  const fetchBalances = useCallback(async () => {
    const walletAddress = address;
    setRefreshing(true);
    setFetchError(null);
    try {
      const provider = getProvider();
      const balance = await provider.getBalance(walletAddress);

      const history = await getActivities(network.id, walletAddress);

      const accRes = await chrome.storage.local.get(['accountCount']);
      const count = accRes.accountCount !== undefined ? Number(accRes.accountCount) : 1;

      const customs = await ensureDefaults(network.id);

      const customResults: Record<string, string> = {};

      await Promise.all(customs.map(async (t) => {
        try {
          const contract = new ethers.Contract(t.address, ['function balanceOf(address) view returns (uint256)'], provider);
          const bal = await contract.balanceOf(walletAddress);
          customResults[t.address] = formatUnitsDisplay(bal, t.decimals);
        } catch {
          customResults[t.address] = '0.0000';
        }
      }));

      const [nativePrice, prices] = await Promise.all([
        getNativeEthPrice(network.id),
        getUsdPrices(network.id, customs),
      ]);

      if (activeAddressRef.current !== walletAddress) return;

      setEthBalance(formatBalance(balance));
      setActivities(history);
      setAccountCount(Math.max(count, (accountIndex || 0) + 1));
      setCustomMetadata(customs);
      setCustomTokenBalances(customResults);
      setCustomPrivateBalances((prev) =>
        mergePrivateBalancesOnFetch(prev, customs.map((t) => t.address)),
      );
      setEthUsdPrice(nativePrice.usd);
      setTokenPrices(prices);
      const latest = Math.max(
        nativePrice.lastUpdated,
        ...Object.values(prices).map((p) => p.lastUpdated)
      );
      setPricesLastUpdated(Number.isFinite(latest) ? latest : null);
      setPricesStale(nativePrice.stale || Object.values(prices).some((p) => p.stale));
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message.trim() : 'Failed to connect to network';
      if (msg.length > 72) msg = `${msg.slice(0, 72)}…`;
      const networkish = /failed to fetch|network request failed|load failed|networkerror|fetch failed|econnrefused|timed out/i.test(msg);
      if (networkish) msg = `${msg} — it might be a network issue; check your internet connection`;
      setFetchError(msg.slice(0, 180));
      setTimeout(() => setFetchError(null), 10000);
    }
    setRefreshing(false);
  }, [address, network.id, accountIndex]);

  const handleRevealNativeEth = async (e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    if (!isNativeWrapperConfigured(network.id as NetworkId)) return;
    setDecryptingEth(true);
    try {
      await initCofheClient(_pk);
      const provider = getProvider();
      const signer = new ethers.Wallet(_pk, provider);
      const wrapperAddr = await getWrapperAddress(provider, NATIVE_TOKEN_METADATA.address);
      if (!wrapperAddr) {
        setEthPrivateBalance('0.0000');
        return;
      }
      const wrapper = new ethers.Contract(
        wrapperAddr,
        ['function confidentialBalanceOf(address) external view returns (bytes32)'],
        signer,
      );
      const ctHash: string = await wrapper.confidentialBalanceOf(address);
      if (activeAddressRef.current !== address) return;
      if (ctHash === '0x' + '0'.repeat(64)) {
        setEthPrivateBalance('0.0000');
      } else {
        const decrypted = await decryptForView(ctHash, network.chainId, address, FheTypes.Uint64);
        if (activeAddressRef.current !== address) return;
        setEthPrivateBalance(ethers.formatUnits(decrypted, 6));
      }
    } catch {
      /* reveal errors are non-critical */
    } finally {
      setDecryptingEth(false);
    }
  };

  const handleRevealToken = async (tokenAddress: string) => {
    setDecryptingTokens(prev => ({ ...prev, [tokenAddress]: true }));
    try {
      await initCofheClient(_pk);
      const provider = getProvider();
      const signer = new ethers.Wallet(_pk, provider);
      const wrapperAddr = await getWrapperAddress(provider, tokenAddress);
      if (!wrapperAddr) {
        setCustomPrivateBalances(prev => ({ ...prev, [tokenAddress]: '0.00' }));
        setDecryptingTokens(prev => ({ ...prev, [tokenAddress]: false }));
        return;
      }

      const wrapper = new ethers.Contract(
        wrapperAddr,
        ['function confidentialBalanceOf(address) external view returns (bytes32)'],
        signer
      );
      
      const ctHash: string = await wrapper.confidentialBalanceOf(address);

      if (activeAddressRef.current !== address) return;
      if (ctHash === '0x' + '0'.repeat(64)) {
        setCustomPrivateBalances(prev => ({ ...prev, [tokenAddress]: '0.0000' }));
      } else {
        const decrypted = await decryptForView(ctHash, network.chainId, address, FheTypes.Uint64);
        if (activeAddressRef.current !== address) return;
        setCustomPrivateBalances(prev => ({ ...prev, [tokenAddress]: formatUnitsDisplay(decrypted, 6) }));
      }
    } catch { /* reveal errors are non-critical */ } finally {
      setDecryptingTokens(prev => ({ ...prev, [tokenAddress]: false }));
    }
  };

  useEffect(() => {
    const reset = resetPrivateBalanceState();
    setEthPrivateBalance(reset.ethPrivateBalance);
    setCustomPrivateBalances(reset.customPrivateBalances);
    setDecryptingEth(false);
    setDecryptingTokens({});
  }, [address]);

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 15000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === 'local' && changes['nixwallet_activity']) {
        getActivities(network.id, address).then(setActivities);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [network.id, address]);

  useEffect(() => {
    if (activeTab === 'activity') {
      getActivities(network.id, address).then(setActivities);
    }
  }, [activeTab, network.id, address]);

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    chrome.storage.local.get([key]).then(res => {
      setCustomMetadata((res[key] as TokenMetadata[]) || []);
    });
  }, [key, showAccountPicker]);

  const priority = ['USDC', 'USDT'];
  const ethFaucetUrl = getNativeEthFaucetUrl(network.id as NetworkId);

  const formatUsd = (value: number | null): string => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
    return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  };
  
  const customHybridTokens = [
    ...customMetadata
  ].sort((a, b) => {
    const aIdx = priority.indexOf(a.symbol);
    const bIdx = priority.indexOf(b.symbol);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return 0;
  }).map(t => ({
      ...t,
      balance: customTokenBalances[t.address] || '0.0000',
      privateBalance: customPrivateBalances[t.address] || '***',
      price: tokenPrices[t.address.toLowerCase()]?.usd ?? null,
      trustStatus: tokenPrices[t.address.toLowerCase()]?.trustStatus ?? 'noData',
  }));

  useEffect(() => {
    if (!showNetworkPicker) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!networkPickerRef.current) return;
      const target = event.target as Node | null;
      if (target && !networkPickerRef.current.contains(target)) {
        setShowNetworkPicker(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNetworkPicker(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showNetworkPicker]);

  return (
    <div className="ui-density-comfortable w-full min-h-screen overflow-hidden bg-app text-main font-brand relative flex flex-col">
      {/* BG Decorators */}
      <div className="absolute top-[-100px] left-[-100px] w-64 h-64 bg-brand-cyan/20 rounded-full mix-blend-screen filter blur-[80px]" />
      <div className="absolute bottom-[-100px] right-[-100px] w-64 h-64 bg-brand-navy/60 rounded-full mix-blend-screen filter blur-[80px]" />

      {/* Header */}
      <header className="w-full p-6 flex justify-between items-center relative z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-cyan flex items-center justify-center">
            <Shield className="w-5 h-5 text-brand-midnight" />
          </div>
          <span className="font-bold text-xl tracking-tighter text-brand-cyan uppercase font-brand">
            Nix
          </span>
        </div>
        <div ref={networkPickerRef} className="flex items-center gap-2 relative">
          <button
            onClick={() => setShowNetworkPicker((prev) => !prev)}
            className="px-3 py-1 bg-surface border-l-2 border-brand-cyan text-label-caps text-brand-cyan flex items-center gap-2 hover:bg-brand-cyan/5 transition-colors"
          >
            <div className="w-1.5 h-1.5 bg-brand-cyan animate-pulse" />
            {network.name}
            <ChevronDown className={`w-3 h-3 transition-transform ${showNetworkPicker ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {showNetworkPicker && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute right-0 top-full mt-2 z-[100] w-44 bg-app border border-ui shadow-card"
              >
                {(Object.keys(FHENIX_NETWORKS) as NetworkId[]).map((id) => {
                  const n = FHENIX_NETWORKS[id];
                  const active = n.id === network.id;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        onNetworkChange?.(id);
                        setShowNetworkPicker(false);
                      }}
                      className={`w-full text-left px-3 py-2 border-b border-ui last:border-b-0 text-xs uppercase tracking-wider transition-colors ${
                        active ? 'text-brand-cyan bg-brand-cyan/10' : 'text-sub bg-app hover:text-main hover:bg-input-field'
                      }`}
                    >
                      {n.name}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button onClick={() => onNavigate('settings')} className="p-2 bg-surface text-sub hover:text-brand-cyan transition-colors border border-ui">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full px-4 pt-1 pb-4 relative z-10 overflow-y-auto no-scrollbar">
        {/* Account Card */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full bg-surface p-6 mb-8 relative border-l-2 border-brand-cyan shadow-card"
        >
          {/* Address & Refresh */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowAccountPicker(true)}
                className="flex items-center gap-2 hover:text-brand-cyan transition-colors group"
              >
                <span className="text-label-caps text-sub group-hover:text-brand-cyan transition-colors">Operator</span>
                <span className="text-xs font-bold text-main">0{(accountIndex || 0) + 1}</span>
                <ChevronDown className="w-3 h-3 text-sub group-hover:text-brand-cyan transition-transform" />
              </button>
              <button
                onClick={copyAddress}
                className="flex items-center gap-2 text-sub hover:text-main transition-colors text-xs font-mono"
              >
                {shortenAddress(address)}
                {copied ? <Check className="w-3 h-3 text-brand-cyan" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <button onClick={fetchBalances} className={`text-sub hover:text-brand-cyan transition-all ${refreshing ? 'animate-spin' : ''}`}>
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Balance */}
          <div className="mb-8">
            <div className="text-label-caps text-slate-500 mb-1">Native Balance</div>
            <div className="text-5xl font-bold tracking-tighter flex items-baseline gap-2 font-brand">
              {ethBalance}
              <span className="text-lg font-normal text-brand-cyan">{network.symbol}</span>
            </div>
            <div className="text-[13px] text-muted mt-2">
              {formatUsd(Number(ethBalance || '0') * (ethUsdPrice ?? 0))}
              {pricesLastUpdated && (
                <span className="ml-2 font-mono">
                  {pricesStale ? 'stale' : 'realtime'}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setShowTokenPicker({ open: true, action: 'send' })}
              className="bg-input-field hover:bg-brand-cyan hover:text-brand-midnight transition-all py-3 flex flex-col items-center gap-1 group"
            >
              <ArrowUpRight className="w-4 h-4 text-brand-cyan group-hover:text-brand-midnight transition-colors" />
              <span className="text-label-caps">Send</span>
            </button>
            <button
              onClick={() => setShowTokenPicker({ open: true, action: 'wrap' })}
              className="bg-input-field hover:bg-brand-cyan hover:text-brand-midnight transition-all py-3 flex flex-col items-center gap-1 group border-l border-ui"
            >
              <ArrowRightLeft className="w-4 h-4 text-brand-cyan group-hover:text-brand-midnight transition-colors" />
              <span className="text-label-caps">Wrap/Unwrap</span>
            </button>
            <button
              onClick={() => onNavigate('swap')}
              className="bg-input-field hover:bg-brand-cyan hover:text-brand-midnight transition-all py-3 flex flex-col items-center gap-1 group border-t border-ui"
            >
              <RefreshCw className="w-4 h-4 text-brand-cyan group-hover:text-brand-midnight transition-colors" />
              <span className="text-label-caps">Swap</span>
            </button>
            <button
              onClick={() => onNavigate('receive')}
              className="bg-input-field hover:bg-brand-cyan hover:text-brand-midnight transition-all py-3 flex flex-col items-center gap-1 group border-t border-l border-ui"
            >
              <ArrowDownRight className="w-4 h-4 text-brand-cyan group-hover:text-brand-midnight transition-colors" />
              <span className="text-label-caps">Receive</span>
            </button>
          </div>
        </motion.div>

        {/* RPC Error Banner */}
        <AnimatePresence>
          {fetchError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-3"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-caption text-red-400 flex-1 font-mono">{fetchError}</span>
              <button onClick={fetchBalances} className="text-micro font-bold text-red-400 hover:text-red-300 uppercase tracking-wider shrink-0">
                Retry
              </button>
              <button onClick={() => setFetchError(null)} className="text-red-400 hover:text-red-300 shrink-0">
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <div className="flex border-b border-ui mb-6">
          {(['tokens', 'activity', 'discover'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 pb-3 text-label-caps transition-all ${
                activeTab === tab
                  ? 'text-brand-cyan border-b-2 border-brand-cyan bg-brand-cyan/5'
                  : 'text-sub hover:text-main'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        {/* Token List */}
        <AnimatePresence mode="wait">
          {activeTab === 'tokens' && (
            <motion.div
              key="tokens"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Native ETH — same split layout as wrapped tokens */}
              <div className={`flex flex-col border-l-2 transition-all ${
                expandedToken === 'ETH' ? 'border-brand-cyan bg-surface' : 'border-transparent bg-surface/50'
              }`}>
                <div
                  onClick={() => setExpandedToken(expandedToken === 'ETH' ? null : 'ETH')}
                  className="flex border-2 border-ui divide-x divide-ui hover:bg-brand-cyan/[0.02] transition-colors group cursor-pointer"
                >
                  <div className="flex-1 p-4 relative overflow-hidden bg-app">
                    <div className="absolute top-2 right-2 opacity-[0.03] pointer-events-none scale-150 origin-top-right">
                      <div className="w-16 h-16 rounded-full border-[6px] border-current flex items-center justify-center font-bold text-3xl">Ξ</div>
                    </div>
                    <div className="text-caption font-bold tracking-widest text-main mb-4 uppercase font-brand">PUBLIC BALANCE</div>
                    <div className="flex items-center gap-3">
                      <TokenIcon symbol={network.symbol} />
                      <div className="min-w-0">
                        <div className="font-brand font-bold text-2xl leading-none mb-1 text-main truncate">{ethBalance}</div>
                        <div className="text-micro font-mono text-muted uppercase tracking-widest leading-none truncate">{network.symbol} · {network.name}</div>
                        <div className="text-caption text-muted font-mono mt-1">{formatUsd(Number(ethBalance || '0') * (ethUsdPrice ?? 0))}</div>
                        {ethFaucetUrl && (
                          <TestnetFaucetLink href={ethFaucetUrl} label="ETH Faucet" />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 p-4 bg-brand-cyan/10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-1 opacity-[0.05] pointer-events-none text-brand-cyan">
                      <Shield className="w-16 h-16" />
                    </div>
                    <div className="text-caption font-bold tracking-widest text-main mb-4 uppercase font-brand">PRIVATE_BALANCE</div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 flex items-center justify-center border-2 border-brand-cyan/55 text-brand-cyan font-bold shadow-none bg-transparent shrink-0">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {!isNativeWrapperConfigured(network.id as NetworkId) ? (
                          <div className="text-caption text-muted leading-relaxed">Wrap ETH to enable cETH</div>
                        ) : ethPrivateBalance !== '***' ? (
                          <>
                            <div className="font-brand font-bold text-2xl leading-none mb-1 text-main truncate">{ethPrivateBalance === '0.0000' ? '0.00' : ethPrivateBalance}</div>
                            <div className="text-micro font-mono text-muted uppercase tracking-widest truncate">C_{network.symbol} TOKEN</div>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRevealNativeEth(); }}
                            disabled={decryptingEth}
                            className="text-micro font-bold text-brand-cyan hover:text-brand-cyan/80 transition-colors uppercase tracking-widest flex items-center gap-2"
                          >
                            {decryptingEth ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : <Eye className="w-3 h-3 shrink-0" />}
                            {decryptingEth ? 'DECRYPTING...' : <span className="text-left leading-tight">REVEAL<br />BALANCE</span>}
                          </button>
                        )}
                      </div>
                    </div>
                    {isNativeWrapperConfigured(network.id as NetworkId) && (
                      <div className="mt-3 text-micro uppercase tracking-wider font-bold text-brand-cyan">Native wrapper</div>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {expandedToken === 'ETH' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-4 pb-4 pt-2 flex flex-col gap-2 border-x border-b border-ui"
                    >
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onNavigate('send', { symbol: network.symbol, address: 'native', decimals: 18, sendMode: 'public' })}
                          className="flex-1 py-3 bg-surface hover:bg-brand-cyan hover:text-brand-midnight text-label-caps transition-all flex items-center justify-center gap-2"
                        >
                          <ArrowUpRight className="w-4 h-4" /> Send
                        </button>
                        {isNativeWrapperConfigured(network.id as NetworkId) && (
                          <button
                            type="button"
                            onClick={() => onNavigate('send', { symbol: network.symbol, address: 'native', decimals: 18, sendMode: 'private' })}
                            className="flex-1 py-3 bg-brand-cyan/10 border border-brand-cyan/40 hover:bg-brand-cyan hover:text-brand-midnight text-label-caps transition-all flex items-center justify-center gap-2"
                          >
                            <Lock className="w-4 h-4" /> Private Send
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('wrap', { symbol: network.symbol, address: 'native', decimals: 18 })}
                        className="w-full py-3 bg-surface hover:bg-brand-cyan hover:text-brand-midnight text-label-caps transition-all flex items-center justify-center gap-2"
                      >
                        <ArrowRightLeft className="w-4 h-4" /> Wrap / Unwrap
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Hybrid FHE Wrapped Tokens */}
              {customHybridTokens.map((token) => (
                <div key={token.symbol} className={`flex flex-col border-l-2 transition-all ${
                  expandedToken === token.symbol ? 'border-brand-cyan bg-surface' : 'border-transparent bg-surface/50'
                }`}>
                  <div
                    onClick={() => setExpandedToken(expandedToken === token.symbol ? null : token.symbol)}
                    className="flex border-2 border-ui divide-x divide-ui hover:bg-brand-cyan/[0.02] transition-colors group cursor-pointer"
                  >
                    {/* Public Sector */}
                    <div className="flex-1 p-4 relative overflow-hidden bg-app">
                      <div className="absolute top-2 right-2 opacity-[0.03] pointer-events-none scale-150 origin-top-right">
                         <div className="w-16 h-16 rounded-full border-[6px] border-current flex items-center justify-center font-bold text-3xl">1</div>
                      </div>
                      <div className="text-caption font-bold tracking-widest text-main mb-4 uppercase font-brand">PUBLIC BALANCE</div>
                      <div className="flex items-center gap-3">
                         <TokenIcon symbol={token.symbol} />
                         <div className="min-w-0">
                            <div className="font-brand font-bold text-2xl leading-none mb-1 text-main truncate">{token.balance === '0.0000' ? '0.00' : token.balance}</div>
                            <div className="text-micro font-mono text-muted uppercase tracking-widest leading-none truncate">{token.symbol} TOKEN</div>
                            <div className="text-[12px] text-slate-500 font-mono mt-1">
                              {token.trustStatus === 'verified'
                                ? formatUsd((Number(token.balance || '0') || 0) * (token.price ?? 0))
                                : '--'}
                            </div>
                            {(() => {
                              const faucetUrl = getStablecoinFaucetUrl(network.id as NetworkId, token.symbol);
                              return faucetUrl ? (
                                <TestnetFaucetLink href={faucetUrl} label={`${token.symbol} Faucet`} />
                              ) : null;
                            })()}
                         </div>
                      </div>
                    </div>

                    {/* Private Sector */}
                    <div className="flex-1 p-4 bg-brand-cyan/10 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-1 opacity-[0.05] pointer-events-none text-brand-cyan">
                         <Shield className="w-16 h-16" />
                      </div>
                      <div className="text-caption font-bold tracking-widest text-main mb-4 uppercase font-brand">PRIVATE_BALANCE</div>
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 flex items-center justify-center border-2 border-brand-cyan/55 text-brand-cyan font-bold shadow-none bg-transparent shrink-0">
                            <Lock className="w-4 h-4" />
                         </div>
                         <div className="flex-1 min-w-0">
                            {token.privateBalance !== '***' ? (
                               <>
                                  <div className="font-brand font-bold text-2xl leading-none mb-1 text-main truncate">{token.privateBalance === '0.0000' ? '0.00' : token.privateBalance}</div>
                                  <div className="text-micro font-mono text-muted uppercase tracking-widest truncate">C_{token.symbol} TOKEN</div>
                               </>
                            ) : (
                               <button
                                 onClick={(e) => { e.stopPropagation(); handleRevealToken(token.address); }}
                                 disabled={decryptingTokens[token.address]}
                                 className="text-micro font-bold text-brand-cyan hover:text-brand-cyan/80 transition-colors uppercase tracking-widest flex items-center gap-2"
                               >
                                  {decryptingTokens[token.address] ? <Loader2 className="w-3 h-3 animate-spin shrink-0"/> : <Eye className="w-3 h-3 shrink-0" />}
                                  {decryptingTokens[token.address] ? 'DECRYPTING...' : <span className="text-left leading-tight">REVEAL<br/>BALANCE</span>}
                               </button>
                            )}
                         </div>
                      </div>
                      <div className="mt-3 text-micro uppercase tracking-wider font-bold">
                        {token.trustStatus === 'verified' && <span className="text-brand-cyan">Verified</span>}
                        {token.trustStatus === 'unverified' && <span className="text-amber-400">Unverified</span>}
                        {token.trustStatus === 'insufficientLiquidity' && <span className="text-amber-400">Low liquidity</span>}
                        {token.trustStatus === 'noData' && <span className="text-muted">No market data</span>}
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedToken === token.symbol && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-4 pb-4 pt-2 flex gap-2 border-x border-b border-ui"
                      >
                        <button
                          onClick={() => onNavigate('send', {
                            symbol: token.symbol,
                            address: token.address,
                            decimals: token.decimals,
                          })}
                          className="flex-1 py-3 bg-surface hover:bg-brand-cyan hover:text-brand-midnight text-label-caps transition-all flex items-center justify-center gap-2"
                        >
                          <ArrowUpRight className="w-4 h-4" /> Send
                        </button>
                        <button
                          onClick={() => onNavigate('wrap', {
                            symbol: token.symbol,
                            address: token.address,
                            decimals: token.decimals,
                          })}
                          className="flex-1 py-3 bg-surface hover:bg-brand-cyan hover:text-brand-midnight text-label-caps transition-all flex items-center justify-center gap-2"
                        >
                          <ArrowRightLeft className="w-4 h-4" /> Wrap/Unwrap
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}

              <button
                onClick={() => onNavigate('manage-tokens')}
                className="w-full py-4 mt-4 border border-dashed border-ui text-sub hover:text-brand-cyan hover:border-brand-cyan/30 transition-all text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Token
              </button>
            </motion.div>
          )}


          {activeTab === 'activity' && (
            <motion.div
              key="activity"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                  <ArrowRightLeft className="w-8 h-8 mb-3 opacity-40" />
                  <p className="text-sm">No activity yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.map(act => {
                    const isOld = Date.now() - act.timestamp > 86400000;
                    const timeStr = isOld
                      ? new Date(act.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : new Date(act.timestamp).toLocaleTimeString();
                    return (
                      <div 
                        key={act.id} 
                        onClick={() => setSelectedActivity(act)}
                        className="flex items-center gap-3 p-3 bg-surface border-2 border-ui hover:bg-input-field cursor-pointer transition-colors group"
                      >
                        <div className={`w-9 h-9 flex items-center justify-center transition-transform group-hover:scale-105 ${
                          act.type === 'send' ? 'bg-brand-cyan/10 text-brand-cyan' :
                          act.type === 'wrap' ? 'bg-brand-cyan/20 text-brand-cyan' :
                          act.type === 'unwrap' ? 'bg-amber-500/10 text-amber-400' :
                          'bg-brand-cyan/10 text-brand-cyan'
                        }`}>
                          {act.type === 'send' ? <ArrowUpRight className="w-4 h-4" /> :
                           act.type === 'wrap' ? <ArrowRightLeft className="w-4 h-4" /> :
                           act.type === 'unwrap' ? <ArrowRightLeft className="w-4 h-4" /> :
                           <Shield className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold capitalize">{act.type.replace('-', ' ')}</span>
                              {act.isConfidential && <Lock className="w-3 h-3 text-brand-cyan" />}
                            </div>
                            <span className={`text-sm font-mono font-bold ${act.status === 'pending' ? 'text-amber-400 animate-pulse' : 'text-main'}`}>
                              {act.amount}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-caption text-sub">{timeStr}</span>
                              {act.recipient && (act.type === 'send' || act.type === 'confidential-transfer') && (
                                <span className="text-micro font-mono text-muted">→ {shortenAddress(act.recipient)}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-caption font-bold uppercase tracking-tighter ${
                                act.status === 'pending' ? 'text-amber-500/80' : 
                                act.status === 'success' ? 'text-brand-cyan' : 'text-red-500/80'
                              }`}>
                                {act.status === 'pending' ? 'confirming' : act.status}
                              </span>
                              {act.txStage && (
                                <span className="text-micro uppercase tracking-wider text-muted">{act.txStage.replaceAll('-', ' ')}</span>
                              )}
                              {act.hash && network.explorer && (
                                <a
                                  href={`${network.explorer}/tx/${act.hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-muted hover:text-brand-cyan transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'discover' && (
            <motion.div
              key="discover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Discover />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Lock */}
      <div className="px-4 pb-3 relative z-10">
        <button
          onClick={onLock}
          className="w-full py-2 text-xs text-muted hover:text-sub transition-colors flex items-center justify-center gap-1"
        >
          <LogOut className="w-3 h-3" /> Lock Wallet
        </button>
      </div>

      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {selectedActivity && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-[340px] bg-app border-l-4 border-brand-cyan p-8 shadow-card"
            >
              <div className="relative">
                <button 
                  onClick={() => setSelectedActivity(null)}
                  className="absolute -top-4 -right-4 p-2 text-slate-500 hover:text-brand-cyan transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="mb-10">
                  <div className="text-label-caps text-brand-cyan mb-2">Transaction Details</div>
                  <h2 className="text-2xl font-bold uppercase font-brand tracking-tighter">
                    {selectedActivity.type}
                  </h2>
                </div>

                <div className="flex justify-between items-start mb-10">
                  <div>
                    <div className="text-label-caps text-muted mb-2">Status</div>
                    <div className={`text-sm font-bold flex items-center gap-2 ${
                      selectedActivity.status === 'success' ? 'text-brand-cyan' : 
                      selectedActivity.status === 'pending' ? 'text-amber-400 animate-pulse' : 'text-red-500'
                    }`}>
                      <div className={`w-2 h-2 ${selectedActivity.status === 'success' ? 'bg-brand-cyan glow-cyan' : 'bg-current'}`} />
                      {selectedActivity.status === 'success' ? 'Success' : selectedActivity.status === 'error' ? 'Failed' : 'Processing'}
                    </div>
                  </div>
                  <div className="text-right">
                    {selectedActivity.hash && network.explorer && (
                      <a
                        href={`${network.explorer}/tx/${selectedActivity.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-label-caps text-brand-cyan hover:text-main flex items-center justify-end gap-1"
                      >
                        Explorer <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="space-y-6 mb-10">
                  <div>
                    <div className="text-label-caps text-muted mb-2">Addresses</div>
                    <div className="bg-surface p-4 font-mono text-caption text-sub space-y-2 border-2 border-ui">
                      <div className="flex justify-between border-b-2 border-ui pb-2">
                        <span>FROM</span>
                        <span className="text-main">{shortenAddress(address)}</span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span>TO</span>
                        <span className="text-main">
                          {selectedActivity.recipient ? shortenAddress(selectedActivity.recipient) : 'SMART CONTRACT'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t-2 border-ui uppercase tracking-widest text-label-caps">
                   <div className="flex justify-between items-center">
                    <span className="text-muted">Amount</span>
                    <span className="text-brand-cyan font-bold text-sm bg-brand-cyan/10 px-2 py-1">{selectedActivity.amount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted">Date</span>
                    <span className="text-main font-mono text-caption">
                      {new Date(selectedActivity.timestamp).toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {selectedActivity.isConfidential && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted">Type</span>
                      <span className="text-brand-cyan text-caption font-bold flex items-center gap-1 bg-brand-cyan/10 px-2 py-1">
                        <Lock className="w-3 h-3" /> Confidential
                      </span>
                    </div>
                  )}
                  {selectedActivity.txStage && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted">Stage</span>
                      <span className="text-main font-mono text-caption">{selectedActivity.txStage}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted shrink-0">Transaction ID</span>
                    {selectedActivity.hash && network.explorer ? (
                      <a
                        href={`${network.explorer}/tx/${selectedActivity.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-main font-mono text-caption hover:text-brand-cyan flex items-center gap-1 min-w-0 justify-end"
                      >
                        <span className="truncate">{selectedActivity.hash.slice(0, 10)}…{selectedActivity.hash.slice(-8)}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 text-brand-cyan" />
                      </a>
                    ) : (
                      <span className="text-main font-mono text-caption">#{selectedActivity.id.slice(0, 8)}</span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedActivity(null)}
                  className="w-full mt-8 py-4 bg-brand-cyan text-brand-midnight font-bold font-brand uppercase tracking-tighter text-sm"
                >
                  Close Details
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AccountPicker
        open={showAccountPicker}
        onClose={() => setShowAccountPicker(false)}
        address={address}
        mnemonic={mnemonic}
        accountIndex={accountIndex}
        accountCount={accountCount}
        importedAccounts={importedAccounts}
        onAccountChange={onAccountChange}
        onImportAccount={onImportAccount}
        onAddHD={(newCount) => {
          setAccountCount(newCount);
          chrome.storage.local.set({ accountCount: newCount });
        }}
      />

      {/* Token Picker Modal */}
      <AnimatePresence>
        {showTokenPicker.open && (
          <div className="absolute inset-0 z-[100] flex flex-col justify-end bg-brand-midnight/80 backdrop-blur-sm">
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full bg-app border-t border-ui max-h-[80%] overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-ui flex justify-between items-center bg-surface">
                <h3 className="text-label-caps text-main font-bold">Select Asset to {showTokenPicker.action}</h3>
                <button 
                  onClick={() => setShowTokenPicker({ open: false, action: 'send' })}
                  className="p-1 hover:text-brand-cyan transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-3">
                {/* Native ETH */}
                {(showTokenPicker.action === 'send' || showTokenPicker.action === 'wrap') && (
                  <button
                    onClick={() => {
                      onNavigate(showTokenPicker.action, { symbol: network.symbol, address: 'native', decimals: 18 });
                      setShowTokenPicker({ open: false, action: showTokenPicker.action });
                    }}
                    className="w-full p-4 bg-surface border border-ui hover:border-brand-cyan transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <TokenIcon symbol={network.symbol} className="w-10 h-10 shrink-0 border border-ui bg-app overflow-hidden group-hover:border-brand-cyan transition-colors" />
                      <div className="text-left">
                        <div className="font-brand font-bold text-sm tracking-tight">{network.symbol}</div>
                        <div className="text-caption text-muted uppercase tracking-widest">Native Asset</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-brand font-bold text-sm">{ethBalance}</div>
                    </div>
                  </button>
                )}

                {/* Tokens */}
                {customHybridTokens.map(token => (
                  <button
                    key={token.address}
                    onClick={() => {
                      onNavigate(showTokenPicker.action, {
                        symbol: token.symbol,
                        address: token.address,
                        decimals: token.decimals,
                      });
                      setShowTokenPicker({ open: false, action: 'send' });
                    }}
                    className="w-full p-4 bg-surface border border-ui hover:border-brand-cyan transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <TokenIcon symbol={token.symbol} className="w-10 h-10 shrink-0 border border-ui bg-app overflow-hidden group-hover:border-brand-cyan transition-colors" />
                      <div className="text-left">
                        <div className="font-brand font-bold text-sm tracking-tight">{token.symbol}</div>
                        <div className="text-caption text-muted uppercase tracking-widest">{token.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-brand font-bold text-sm">{token.balance}</div>
                      {showTokenPicker.action === 'wrap' && (
                        <div className="text-micro font-bold uppercase tracking-widest text-brand-cyan">
                          FHERC20
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
