import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ArrowRightLeft, ArrowUpRight, ArrowDownRight,
  Lock, Copy, Check, Settings, LogOut, RefreshCw, Eye, Loader2, X, ExternalLink, ChevronDown, Plus, AlertCircle, Download,
  DollarSign
} from 'lucide-react';
import { shortenAddress, formatBalance, getProvider } from '../lib/wallet';
import { CONTRACTS } from '../lib/contracts';
import { initCofheClient, decryptForView } from '../lib/cofhe';
import { getActivities, type Activity } from '../lib/activity';
import { ethers } from 'ethers';
import Discover from './Discover';
import ThemeToggle from '../components/ThemeToggle';

interface Props {
  address: string;
  privateKey: string;
  mnemonic?: string;
  accountIndex?: number;
  importedAccounts?: { address: string; privateKey: string; name?: string }[];
  network: any;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onNavigate: (screen: string, tokenData?: any) => void;
  onAccountChange?: (arg: number | string) => void;
  onImportAccount?: (acc: { address: string; privateKey: string; name?: string }, password: string) => Promise<boolean>;
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
  onLock
}: Props) {
  const [activeTab, setActiveTab] = useState<'tokens' | 'activity' | 'discover'>('tokens');
  const [ethBalance, setEthBalance] = useState('0.0000');
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
  const [isImporting, setIsImporting] = useState(false);
  const [importPK, setImportPK] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [showTokenPicker, setShowTokenPicker] = useState<{ open: boolean; action: 'send' | 'wrap' }>({ open: false, action: 'send' });

  const fetchBalances = useCallback(async () => {
    setRefreshing(true);
    try {
      const provider = getProvider();
      const balance = await provider.getBalance(address);
      setEthBalance(formatBalance(balance));

      const history = await getActivities(network.id, address);
      setActivities(history);

      // Fetch dynamic account count
      const accRes = await chrome.storage.local.get(['accountCount']);
      const count = accRes.accountCount !== undefined ? Number(accRes.accountCount) : 1;
      setAccountCount(Math.max(count, (accountIndex || 0) + 1));

      // Fetch custom tokens
      const injectedKey = `injected_defaults_${network.id}`;
      const [storageRes, injectedRes] = await Promise.all([
        chrome.storage.local.get([key]),
        chrome.storage.local.get([injectedKey])
      ]);
      
      let customs = (storageRes[key] || []) as any[];

      const SEPOLIA_DEFAULTS = network.id === 'sepolia' ? [
        { symbol: 'USDT', name: 'Tether USD', address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', decimals: 6, isDefault: true },
        { symbol: 'USDC', name: 'USD Coin', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, isDefault: true },
      ] : [];

      if (!injectedRes[injectedKey]) {
        let addedDefaults = false;
        SEPOLIA_DEFAULTS.forEach(def => {
          if (!customs.find(c => c.address.toLowerCase() === def.address.toLowerCase())) {
            customs.push(def);
            addedDefaults = true;
          }
        });
        
        if (addedDefaults) {
          await chrome.storage.local.set({ [key]: customs });
        }
        await chrome.storage.local.set({ [injectedKey]: true });
      }

      const customResults: Record<string, string> = {};
      const customPrivates: Record<string, string | null> = {};

      const allToFetch = [...customs];

      await Promise.all(allToFetch.map(async (t) => {
        try {
          const contract = new ethers.Contract(t.address, ['function balanceOf(address) view returns (uint256)'], provider);
          const bal = await contract.balanceOf(address);
          customResults[t.address] = ethers.formatUnits(bal, t.decimals);

          customPrivates[t.address] = customPrivateBalances[t.address] || '***';
        } catch (e) {
          customResults[t.address] = '0.0000';
          customPrivates[t.address] = '0.0000';
        }
      }));
      setCustomTokenBalances(customResults);
      setCustomPrivateBalances(prev => ({...prev, ...customPrivates}));
    } catch (e) {
      console.error('Failed to fetch data:', e);
    }
    setRefreshing(false);
  }, [address, network.id]);

  const handleRevealToken = async (tokenAddress: string, decimals: number) => {
    setDecryptingTokens(prev => ({ ...prev, [tokenAddress]: true }));
    try {
      await initCofheClient(_pk);
      const provider = getProvider();
      const signer = new ethers.Wallet(_pk, provider);
      const wrapper = new ethers.Contract(
        CONTRACTS.wrapper,
        ['function getBalance(address) external view returns (bytes32)'],
        signer
      );
      
      const ctHash: string = await wrapper.getBalance(tokenAddress);
      
      if (ctHash === '0x' + '0'.repeat(64)) {
        setCustomPrivateBalances(prev => ({ ...prev, [tokenAddress]: '0.0000' }));
      } else {
        const decryptedWei = await decryptForView(ctHash, network.chainId, address);
        setCustomPrivateBalances(prev => ({ ...prev, [tokenAddress]: ethers.formatUnits(decryptedWei, decimals) }));
      }
    } catch (e: any) {
      console.error('Reveal Error:', e);
    } finally {
      setDecryptingTokens(prev => ({ ...prev, [tokenAddress]: false }));
    }
  };

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 15000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes['nixwallet_activity']) {
        getActivities(network.id, address).then(setActivities);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [network.id]);

  useEffect(() => {
    if (activeTab === 'activity') {
      getActivities(network.id, address).then(setActivities);
    }
  }, [activeTab, network.id]);

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };



  // Map custom tokens
  const key = `custom_tokens_${network.id}`;
  // Note: we fetch this in useEffect/fetchBalances, but we need the metadata here for the UI list.
  // We'll use a local state for the metadata too or just pull from storage once.
  const [customMetadata, setCustomMetadata] = useState<any[]>([]);
  useEffect(() => {
     chrome.storage.local.get([key]).then(res => {
       const data = res[key] as any[];
       setCustomMetadata(data || []);
     });
     
     // Also sync account count
     chrome.storage.local.get(['accountCount']).then(res => {
       const count = res.accountCount !== undefined ? Number(res.accountCount) : 1;
       setAccountCount(Math.max(count, (accountIndex || 0) + 1));
     });
  }, [network.id, accountIndex, showAccountPicker]); // refresh when account or network changes

   const priority = ['USDT', 'USDC'];
  
  const customHybridTokens = [
    ...customMetadata
  ].sort((a, b) => {
    const aIdx = priority.indexOf(a.symbol);
    const bIdx = priority.indexOf(b.symbol);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return 0;
  }).map(t => {
      let iconNode: React.ReactNode = t.symbol[0];
      if (t.symbol === 'USDT') iconNode = <DollarSign className="w-5 h-5 text-emerald-500" />;
      if (t.symbol === 'USDC') iconNode = <DollarSign className="w-5 h-5 text-blue-500" />;

      return {
        ...t,
        balance: customTokenBalances[t.address] || '0.0000',
        privateBalance: customPrivateBalances[t.address] || '***',
        icon: iconNode
      };
  });

  return (
    <div className="w-[360px] h-[600px] overflow-hidden bg-app text-main font-brand relative flex flex-col">
      {/* BG Decorators */}
      <div className="absolute top-[-100px] left-[-100px] w-64 h-64 bg-brand-cyan/20 rounded-full mix-blend-screen filter blur-[80px]" />
      <div className="absolute bottom-[-100px] right-[-100px] w-64 h-64 bg-brand-navy/60 rounded-full mix-blend-screen filter blur-[80px]" />

      {/* Header */}
      <header className="w-full p-6 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-cyan flex items-center justify-center">
            <Shield className="w-5 h-5 text-brand-midnight" />
          </div>
          <span className="font-bold text-xl tracking-tighter text-brand-cyan uppercase font-brand">
            Nix
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 bg-surface border-l-2 border-brand-cyan text-label-caps text-brand-cyan flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-brand-cyan animate-pulse" />
            {network.name}
          </div>
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
              {/* Native ETH Token View */}
              <div className={`flex flex-col border-l-2 transition-all ${
                expandedToken === 'ETH' ? 'border-brand-cyan bg-surface' : 'border-transparent bg-surface/50'
              }`}>
                <div
                  onClick={() => setExpandedToken(expandedToken === 'ETH' ? null : 'ETH')}
                  className="flex items-center justify-between p-4 border border-ui hover:bg-brand-cyan/[0.02] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 flex items-center justify-center text-sm font-bold border border-white/10 text-slate-300 bg-surface">
                      Ξ
                    </div>
                    <div>
                      <div className="font-brand font-bold text-sm tracking-tight">{network.symbol}</div>
                      <div className="text-label-caps text-slate-500">{network.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-brand font-bold text-sm tracking-tight">{ethBalance}</div>
                    <div className="text-[10px] text-slate-600 font-mono">0.00 USD</div>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedToken === 'ETH' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="px-4 pb-4 pt-2 flex gap-2 border-x border-b border-ui"
                    >
                      <button
                        onClick={() => onNavigate('send')}
                        className="flex-1 py-3 bg-surface hover:bg-brand-cyan hover:text-brand-midnight text-label-caps transition-all flex items-center justify-center gap-2"
                      >
                        <ArrowUpRight className="w-4 h-4" /> Send
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
                    className="flex border border-ui divide-x divide-ui hover:bg-brand-cyan/[0.02] transition-colors group cursor-pointer"
                  >
                    {/* Public Sector */}
                    <div className="flex-1 p-4 relative overflow-hidden bg-app">
                      <div className="absolute top-2 right-2 opacity-[0.03] pointer-events-none scale-150 origin-top-right">
                         <div className="w-16 h-16 rounded-full border-[6px] border-current flex items-center justify-center font-bold text-3xl">1</div>
                      </div>
                      <div className="text-[10px] font-bold tracking-widest text-main mb-4 uppercase font-brand">PUBLIC BALANCE</div>
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 flex items-center justify-center border border-ui text-main font-bold text-sm bg-app shrink-0">
                            {token.icon}
                         </div>
                         <div className="min-w-0">
                            <div className="font-brand font-bold text-2xl leading-none mb-1 text-main truncate">{token.balance === '0.0000' ? '0.00' : token.balance}</div>
                            <div className="text-[9px] font-mono text-muted uppercase tracking-widest leading-none truncate">{token.symbol} TOKEN</div>
                         </div>
                      </div>
                    </div>

                    {/* Private Sector */}
                    <div className="flex-1 p-4 bg-brand-cyan/10 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-1 opacity-[0.05] pointer-events-none text-brand-cyan">
                         <Shield className="w-16 h-16" />
                      </div>
                      <div className="text-[10px] font-bold tracking-widest text-main mb-4 uppercase font-brand">PRIVATE_BALANCE</div>
                      <div className="flex items-center gap-3">
                         <div className="w-10 h-10 flex items-center justify-center border border-brand-cyan/40 text-brand-cyan font-bold shadow-none bg-transparent shrink-0">
                            <Lock className="w-4 h-4" />
                         </div>
                         <div className="flex-1 min-w-0">
                            {token.privateBalance !== '***' ? (
                               <>
                                  <div className="font-brand font-bold text-2xl leading-none mb-1 text-main truncate">{token.privateBalance === '0.0000' ? '0.00' : token.privateBalance}</div>
                                  <div className="text-[9px] font-mono text-muted uppercase tracking-widest truncate">C_{token.symbol} TOKEN</div>
                               </>
                            ) : (
                               <button
                                 onClick={(e) => { e.stopPropagation(); handleRevealToken(token.address, token.decimals); }}
                                 disabled={decryptingTokens[token.address]}
                                 className="text-[9px] font-bold text-brand-cyan hover:text-brand-cyan/80 transition-colors uppercase tracking-widest flex items-center gap-2"
                               >
                                  {decryptingTokens[token.address] ? <Loader2 className="w-3 h-3 animate-spin shrink-0"/> : <Eye className="w-3 h-3 shrink-0" />}
                                  {decryptingTokens[token.address] ? 'DECRYPTING...' : <span className="text-left leading-tight">REVEAL<br/>BALANCE</span>}
                               </button>
                            )}
                         </div>
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
                          onClick={() => onNavigate('send', { symbol: token.symbol, address: token.address, decimals: token.decimals })}
                          className="flex-1 py-3 bg-surface hover:bg-brand-cyan hover:text-brand-midnight text-label-caps transition-all flex items-center justify-center gap-2"
                        >
                          <ArrowUpRight className="w-4 h-4" /> Send
                        </button>
                        <button
                          onClick={() => onNavigate('wrap', { symbol: token.symbol, address: token.address, decimals: token.decimals })}
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
                  {activities.map(act => (
                    <div 
                      key={act.id} 
                      onClick={() => setSelectedActivity(act)}
                      className="flex items-center gap-3 p-3 bg-surface border border-ui hover:bg-input-field cursor-pointer transition-colors group"
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
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-semibold capitalize">{act.type.replace('-', ' ')}</span>
                          <span className={`text-sm font-mono font-bold ${act.status === 'pending' ? 'text-amber-400 animate-pulse' : 'text-main'}`}>
                            {act.amount}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-sub">{new Date(act.timestamp).toLocaleTimeString()}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-tighter ${
                            act.status === 'pending' ? 'text-amber-500/80' : 
                            act.status === 'success' ? 'text-brand-cyan' : 'text-red-500/80'
                          }`}>
                            {act.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
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
                      {selectedActivity.status === 'success' ? 'Success' : 'Processing'}
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
                    <div className="bg-surface p-4 font-mono text-[10px] text-sub space-y-2 border border-ui">
                      <div className="flex justify-between border-b border-ui pb-2">
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

                <div className="space-y-4 pt-6 border-t border-ui uppercase tracking-widest text-label-caps">
                   <div className="flex justify-between items-center">
                    <span className="text-muted">Amount</span>
                    <span className="text-brand-cyan font-bold text-sm bg-brand-cyan/10 px-2 py-1">{selectedActivity.amount}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted">Transaction ID</span>
                    <span className="text-main font-mono">#{selectedActivity.id.slice(0, 8)}</span>
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

      {/* Account Picker Modal */}
      <AnimatePresence>
        {showAccountPicker && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-[300px] bg-app border border-ui rounded-3xl overflow-hidden shadow-card max-h-[85vh] flex flex-col"
            >
              <div className="p-5 border-b border-ui shrink-0 flex justify-between items-center bg-app z-10">
                <h3 className="text-lg font-bold text-main">Select Account</h3>
                <button onClick={() => setShowAccountPicker(false)} className="p-1.5 rounded-full hover:bg-ui transition-colors">
                  <X className="w-4 h-4 text-sub" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 min-h-0 relative">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 px-2">HD Wallets</h3>
                <div className="space-y-2 mb-6">
                  {Array.from({ length: accountCount }).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        onAccountChange?.(idx);
                        setShowAccountPicker(false);
                      }}
                      className={`w-full p-4 rounded-2xl border transition-all flex items-center gap-3 ${
                        (accountIndex !== undefined && typeof accountIndex === 'number' && accountIndex === idx)
                          ? 'bg-brand-cyan/10 border-brand-cyan/50 text-main shadow-lg'
                          : 'bg-surface border-ui text-sub hover:bg-input-field hover:border-brand-cyan/30'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        (accountIndex !== undefined && typeof accountIndex === 'number' && accountIndex === idx) ? 'bg-brand-cyan text-brand-midnight' : 'bg-surface border border-ui text-sub'
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-bold text-main">Account {idx + 1}</div>
                        <div className="text-[10px] opacity-50 font-mono">
                          {idx === 0 ? 'Primary' : `Derived Account ${idx}`}
                        </div>
                      </div>
                      {(accountIndex !== undefined && typeof accountIndex === 'number' && accountIndex === idx) && (
                        <Check className="w-4 h-4 text-brand-cyan ml-auto" />
                      )}
                    </button>
                  ))}
                </div>

                {importedAccounts && importedAccounts.length > 0 && (
                  <>
                    <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 px-2">Imported</h3>
                    <div className="space-y-2 mb-6">
                      {importedAccounts.map((acc, idx) => (
                        <button
                          key={acc.address}
                          onClick={() => {
                            onAccountChange?.(acc.address);
                            setShowAccountPicker(false);
                          }}
                          className={`w-full p-4 rounded-2xl border transition-all flex items-center gap-3 ${
                            address.toLowerCase() === acc.address.toLowerCase()
                              ? 'bg-brand-cyan/10 border-brand-cyan/50 text-main shadow-lg'
                              : 'bg-surface border-ui text-sub hover:bg-input-field hover:border-brand-cyan/30'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                            address.toLowerCase() === acc.address.toLowerCase() ? 'bg-brand-cyan text-brand-midnight' : 'bg-surface border border-ui text-sub'
                          }`}>
                            <Download className="w-3.5 h-3.5" />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-bold text-main">{acc.name || `Imported ${idx + 1}`}</div>
                            <div className="text-[10px] opacity-50 font-mono">
                              {shortenAddress(acc.address)}
                            </div>
                          </div>
                          {address.toLowerCase() === acc.address.toLowerCase() && (
                            <Check className="w-4 h-4 text-brand-cyan ml-auto" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {!isImporting ? (
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    {mnemonic && (
                      <button
                        onClick={() => {
                          const newCount = accountCount + 1;
                          setAccountCount(newCount);
                          chrome.storage.local.set({ accountCount: newCount });
                          onAccountChange?.(newCount - 1);
                          setShowAccountPicker(false);
                        }}
                        className="py-3 rounded-xl border border-dashed border-ui text-brand-cyan hover:text-brand-cyan hover:border-brand-cyan/50 hover:bg-brand-cyan/5 transition-all flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider"
                      >
                        <Plus className="w-3 h-3" /> Add HD
                      </button>
                    )}
                    <button
                      onClick={() => setIsImporting(true)}
                      className="py-3 rounded-xl border border-dashed border-ui text-brand-cyan hover:text-brand-cyan hover:border-brand-cyan/50 hover:bg-brand-cyan/5 transition-all flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider"
                    >
                      <Download className="w-3 h-3" /> Import PK
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 mb-6 bg-surface border border-ui p-4 rounded-2xl">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-muted uppercase">Import Private Key</span>
                      <button onClick={() => { setIsImporting(false); setImportPK(''); setImportError(''); }} className="text-sub hover:text-main">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <textarea
                      value={importPK}
                      onChange={(e) => setImportPK(e.target.value)}
                      placeholder="Paste your private key here..."
                      className="w-full bg-input-field border border-ui rounded-xl p-3 text-xs text-main font-mono h-20 focus:border-brand-cyan/50 outline-none resize-none transition-colors mb-2 placeholder:text-muted"
                    />
                    <input
                      type="password"
                      value={importPassword}
                      onChange={(e) => setImportPassword(e.target.value)}
                      placeholder="Your wallet password to encrypt..."
                      className="w-full bg-input-field border border-ui rounded-xl p-3 text-xs text-main focus:border-brand-cyan/50 outline-none transition-colors placeholder:text-muted"
                    />
                    {importError && <p className="text-[10px] text-red-400">{importError}</p>}
                    <button
                      disabled={importLoading || !importPK || !importPassword}
                      onClick={async () => {
                        setImportLoading(true);
                        setImportError('');
                        try {
                          const cleanPK = importPK.trim().startsWith('0x') ? importPK.trim() : `0x${importPK.trim()}`;
                          const wallet = new ethers.Wallet(cleanPK);
                          const success = await onImportAccount?.({
                            address: wallet.address,
                            privateKey: wallet.privateKey
                          }, importPassword);
                          
                          if (success) {
                            setShowAccountPicker(false);
                            setIsImporting(false);
                            setImportPK('');
                            setImportPassword('');
                          } else {
                            setImportError('Incorrect password');
                          }
                        } catch (e) {
                          setImportError('Invalid private key');
                        }
                        setImportLoading(false);
                      }}
                      className="w-full bg-brand-cyan hover:bg-brand-cyan/80 disabled:opacity-50 disabled:cursor-not-allowed text-brand-midnight py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                      {importLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Import Key'}
                    </button>
                  </div>
                )}

                {!mnemonic && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-200">
                      Multi-account support requires a recovery phrase. Currently using a direct private key.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                {/* ETH (Only for Send) */}
                {showTokenPicker.action === 'send' && (
                  <button
                    onClick={() => {
                      onNavigate('send', { symbol: network.symbol, address: ethers.ZeroAddress, decimals: 18 });
                      setShowTokenPicker({ open: false, action: 'send' });
                    }}
                    className="w-full p-4 bg-surface border border-ui hover:border-brand-cyan transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 flex items-center justify-center border border-ui bg-app text-brand-cyan font-bold tracking-tighter group-hover:bg-brand-cyan group-hover:text-brand-midnight transition-all">
                        E
                      </div>
                      <div className="text-left">
                        <div className="font-brand font-bold text-sm tracking-tight">{network.symbol}</div>
                        <div className="text-[10px] text-muted uppercase tracking-widest">Native Asset</div>
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
                      onNavigate(showTokenPicker.action, { symbol: token.symbol, address: token.address, decimals: token.decimals });
                      setShowTokenPicker({ open: false, action: 'send' });
                    }}
                    className="w-full p-4 bg-surface border border-ui hover:border-brand-cyan transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 flex items-center justify-center border border-ui bg-app text-brand-cyan font-bold tracking-tighter group-hover:bg-brand-cyan group-hover:text-brand-midnight transition-all">
                        {token.icon}
                      </div>
                      <div className="text-left">
                        <div className="font-brand font-bold text-sm tracking-tight">{token.symbol}</div>
                        <div className="text-[10px] text-muted uppercase tracking-widest">{token.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-brand font-bold text-sm">{token.balance}</div>
                      {showTokenPicker.action === 'wrap' && (
                        <div className="text-[9px] text-brand-cyan font-bold uppercase tracking-widest">Supports FHE</div>
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
