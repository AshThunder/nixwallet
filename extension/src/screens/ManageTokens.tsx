import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Search, Trash2, Loader2, AlertCircle, CheckCircle, Bitcoin, DollarSign, Sparkles } from 'lucide-react';
import { getProvider, shortenAddress } from '../lib/wallet';
import { getCustomTokens, saveCustomTokens, type TokenMetadata } from '../lib/tokens';
import { discoverSepoliaWalletTokens, type DetectedToken } from '../lib/detectTokens';
import { ethers } from 'ethers';

interface Props {
  network: { id: string; [k: string]: unknown };
  walletAddress: string;
  onBack: () => void;
}

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const PAGE_SIZE = 8;

function matchesTokenFilter(
  q: string,
  parts: { symbol: string; name: string; address: string }
): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    parts.symbol.toLowerCase().includes(s) ||
    parts.name.toLowerCase().includes(s) ||
    parts.address.toLowerCase().includes(s)
  );
}

export default function ManageTokens({ network, walletAddress, onBack }: Props) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [customTokens, setCustomTokens] = useState<TokenMetadata[]>([]);
  const [success, setSuccess] = useState(false);
  const [detected, setDetected] = useState<DetectedToken[]>([]);
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectHint, setDetectHint] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'wallet' | 'saved'>('wallet');
  const [listFilter, setListFilter] = useState('');
  const [listPage, setListPage] = useState(1);

  const filteredSaved = useMemo(
    () =>
      customTokens.filter(t =>
        matchesTokenFilter(listFilter, { symbol: t.symbol, name: t.name, address: t.address })
      ),
    [customTokens, listFilter]
  );

  const filteredDetected = useMemo(
    () =>
      detected.filter(t =>
        matchesTokenFilter(listFilter, { symbol: t.symbol, name: t.name, address: t.address })
      ),
    [detected, listFilter]
  );

  const activeListLength = activeTab === 'saved' ? filteredSaved.length : filteredDetected.length;
  const totalPages = Math.max(1, Math.ceil(activeListLength / PAGE_SIZE));

  const paginatedSaved = useMemo(
    () => filteredSaved.slice((listPage - 1) * PAGE_SIZE, listPage * PAGE_SIZE),
    [filteredSaved, listPage]
  );

  const paginatedDetected = useMemo(
    () => filteredDetected.slice((listPage - 1) * PAGE_SIZE, listPage * PAGE_SIZE),
    [filteredDetected, listPage]
  );

  useEffect(() => {
    setListPage(1);
  }, [listFilter, activeTab, customTokens.length, detected.length]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  useEffect(() => {
    loadTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadTokens uses network.id from closure
  }, [network.id]);

  const loadTokens = async () => {
    const tokens = await getCustomTokens(network.id);
    setCustomTokens(tokens);
  };

  /** Full discovery — only on wallet/network change or after removing a saved token (not after every add). */
  const scanWalletTokens = useCallback(async () => {
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      setDetected([]);
      setDetectHint(null);
      setDetectLoading(false);
      return;
    }
    if (network.id !== 'sepolia') {
      setDetected([]);
      setDetectHint('Token detection runs on Ethereum Sepolia.');
      setDetectLoading(false);
      return;
    }

    setDetectLoading(true);
    setDetectHint(null);
    try {
      const provider = getProvider();
      const savedList = await getCustomTokens(network.id);
      const saved = new Set(savedList.map(t => t.address.toLowerCase()));
      const { tokens, hint } = await discoverSepoliaWalletTokens(provider, walletAddress, saved);
      setDetected(tokens);
      setDetectHint(hint ?? null);
    } catch {
      setDetected([]);
      setDetectHint('Could not scan wallet for tokens.');
    } finally {
      setDetectLoading(false);
    }
  }, [network.id, walletAddress]);

  useEffect(() => {
    void scanWalletTokens();
  }, [scanWalletTokens]);

  const handleSaveTokens = async (tokens: TokenMetadata[]) => {
    await saveCustomTokens(network.id, tokens);
    setCustomTokens(tokens);
  };

  const handleSearch = async () => {
    if (!ethers.isAddress(address)) {
      setError('Invalid contract address');
      return;
    }

    if (customTokens.some(t => t.address.toLowerCase() === address.toLowerCase())) {
      setError('Token already indexed');
      return;
    }

    setLoading(true);
    setError(null);
    setMetadata(null);

    try {
      const provider = getProvider();
      const contract = new ethers.Contract(address, ERC20_ABI, provider);
      
      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
      ]);

      setMetadata({ address, name, symbol, decimals: Number(decimals) });
    } catch {
      setError('Could not fetch token data. Is this an ERC-20 contract?');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!metadata) return;
    const newTokens = [...customTokens, metadata];
    await handleSaveTokens(newTokens);
    const added = metadata.address.toLowerCase();
    setDetected(prev => prev.filter(t => t.address.toLowerCase() !== added));
    setMetadata(null);
    setAddress('');
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const handleQuickAddDetected = async (row: DetectedToken) => {
    const meta: TokenMetadata = {
      address: row.address,
      name: row.name,
      symbol: row.symbol,
      decimals: row.decimals,
    };
    if (customTokens.some(t => t.address.toLowerCase() === meta.address.toLowerCase())) return;
    const newTokens = [...customTokens, meta];
    await handleSaveTokens(newTokens);
    const added = row.address.toLowerCase();
    setDetected(prev => prev.filter(t => t.address.toLowerCase() !== added));
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const tokenIcon = (symbol: string) => {
    let iconNode: ReactNode = symbol[0];
    let bgClass = 'bg-ui text-main';
    if (symbol === 'USDT') {
      iconNode = <DollarSign className="w-5 h-5 text-emerald-500" />;
      bgClass = 'bg-emerald-500/10';
    } else if (symbol === 'USDC') {
      iconNode = <DollarSign className="w-5 h-5 text-blue-500" />;
      bgClass = 'bg-blue-500/10';
    } else if (symbol === 'WBTC') {
      iconNode = <Bitcoin className="w-5 h-5 text-orange-500" />;
      bgClass = 'bg-orange-500/10';
    }
    return { iconNode, bgClass };
  };

  const handleRemove = async (addr: string) => {
    const newTokens = customTokens.filter(t => t.address.toLowerCase() !== addr.toLowerCase());
    await handleSaveTokens(newTokens);
    await scanWalletTokens();
  };

  return (
    <div className="w-full min-h-screen bg-app text-main font-sans flex flex-col relative overflow-hidden">
      <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-brand-cyan/10 blur-[80px]" />
      
      <header className="p-6 flex items-center gap-4 border-b border-ui relative z-10">
        <button onClick={onBack} className="text-sub hover:text-brand-cyan transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold font-brand uppercase tracking-tighter">Add Token</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar relative z-10">
        {/* Search Context */}
        <section>
          <div className="text-label-caps text-brand-cyan mb-2">Search for Token</div>
          <div className="relative group">
            <input
              type="text"
              placeholder="ERC-20 contract address (0x…)"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setError(null);
                setMetadata(null);
              }}
              className="w-full bg-surface border-l-2 border-brand-cyan p-4 text-xs font-mono text-main focus:outline-none focus:bg-input-field transition-all placeholder:text-muted"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !address}
              className="absolute right-2 top-1.5 p-2 bg-brand-cyan text-brand-midnight hover:opacity-90 transition-all disabled:opacity-20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </div>
          {error && (
            <div className="mt-3 text-[10px] text-red-500 font-bold uppercase tracking-widest flex items-center gap-2">
              <AlertCircle className="w-3 h-3" /> {error}
            </div>
          )}
        </section>

        {/* Search Result */}
        <AnimatePresence>
          {metadata && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="bg-surface border border-ui p-6 space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-2xl font-bold font-brand tracking-tighter uppercase">{metadata.symbol}</div>
                    <div className="text-[10px] text-sub uppercase tracking-widest leading-loose">{metadata.name}</div>
                  </div>
                  <div className="text-label-caps text-brand-cyan">
                    {metadata.decimals} Decimals
                  </div>
                </div>
                <button
                  onClick={handleAdd}
                  className="w-full py-4 bg-brand-cyan text-brand-midnight text-label-caps font-bold transition-all shadow-[0_0_20px_rgba(10,217,220,0.1)] flex items-center justify-center gap-3"
                >
                  <Plus className="w-4 h-4" /> Add to Wallet
                </button>

                <div className="pt-2 border-t border-ui">
                  <div className="text-[9px] text-muted font-mono uppercase opacity-70">
                    FHERC20 wrappers are deployed automatically via the on-chain registry when you first wrap this token.
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Alert */}
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-brand-cyan/10 border-l-4 border-brand-cyan p-4 flex items-center gap-3"
            >
              <CheckCircle className="w-4 h-4 text-brand-cyan" />
              <span className="text-[10px] text-brand-cyan font-bold uppercase tracking-widest">Token Added Successfully</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs + list filter */}
        <section className="space-y-4">
          <div className="flex bg-surface p-1 border border-ui">
            <button
              type="button"
              onClick={() => setActiveTab('wallet')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-label-caps transition-all ${
                activeTab === 'wallet'
                  ? 'bg-brand-cyan text-brand-midnight font-bold'
                  : 'text-sub hover:text-main'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              In your wallet ({detected.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`flex-1 py-3 text-label-caps transition-all ${
                activeTab === 'saved'
                  ? 'bg-brand-cyan text-brand-midnight font-bold'
                  : 'text-sub hover:text-main'
              }`}
            >
              Saved ({customTokens.length})
            </button>
          </div>

          <div>
            <div className="text-label-caps text-muted mb-2 px-1">Filter list</div>
            <input
              type="search"
              placeholder="Name, symbol, or 0x address"
              value={listFilter}
              onChange={e => setListFilter(e.target.value)}
              className="w-full bg-surface border border-ui p-3 text-xs text-main focus:outline-none focus:border-brand-cyan transition-all placeholder:text-muted"
            />
          </div>

          {activeTab === 'wallet' && (
            <>
              <p className="text-[10px] text-muted px-1 leading-relaxed">
                Non-zero balances not saved yet (Sepolia: indexers + recent transfers + probe list).
              </p>
              {detectHint && (
                <div className="p-3 bg-amber-500/5 border border-amber-500/15 text-[10px] text-amber-400/90 font-mono leading-relaxed">
                  {detectHint}
                </div>
              )}
              {detectLoading ? (
                <div className="py-10 flex justify-center bg-surface border border-ui">
                  <Loader2 className="w-6 h-6 animate-spin text-brand-cyan" />
                </div>
              ) : network.id !== 'sepolia' ? (
                <div className="py-8 text-center bg-surface border border-ui text-label-caps text-muted">
                  {detectHint || 'Switch to Sepolia to detect tokens.'}
                </div>
              ) : filteredDetected.length === 0 ? (
                <div className="py-8 text-center bg-surface border border-ui text-label-caps text-muted">
                  {detected.length === 0
                    ? 'No additional ERC-20s with balance found. Add by contract above or receive tokens first.'
                    : 'No tokens match your filter.'}
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    {paginatedDetected.map(row => {
                      const { iconNode, bgClass } = tokenIcon(row.symbol);
                      return (
                        <div
                          key={row.address}
                          className="bg-surface hover:bg-input-field p-4 flex items-center justify-between gap-3 transition-colors border border-ui"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={`w-10 h-10 flex shrink-0 items-center justify-center text-xs font-bold ${bgClass}`}>
                              {iconNode}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold font-brand uppercase tracking-tighter text-main truncate">{row.symbol}</div>
                              <div className="text-[10px] text-sub uppercase tracking-tight truncate opacity-80">{row.name}</div>
                              <div className="text-[10px] text-sub font-mono truncate">{shortenAddress(row.address)}</div>
                              <div className="text-[10px] text-brand-cyan font-mono mt-0.5">Bal: {row.balanceFormatted}</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleQuickAddDetected(row)}
                            className="shrink-0 py-2 px-3 bg-brand-cyan text-brand-midnight text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" /> Add
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 px-1 border-t border-ui">
                      <button
                        type="button"
                        disabled={listPage <= 1}
                        onClick={() => setListPage(p => Math.max(1, p - 1))}
                        className="text-[10px] font-bold uppercase tracking-widest text-brand-cyan disabled:opacity-25 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="text-[10px] text-muted font-mono">
                        {listPage} / {totalPages} · {filteredDetected.length} tokens
                      </span>
                      <button
                        type="button"
                        disabled={listPage >= totalPages}
                        onClick={() => setListPage(p => Math.min(totalPages, p + 1))}
                        className="text-[10px] font-bold uppercase tracking-widest text-brand-cyan disabled:opacity-25 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {activeTab === 'saved' && (
            <>
              {customTokens.length === 0 ? (
                <div className="py-12 text-center bg-surface border border-ui">
                  <p className="text-label-caps text-muted">No saved tokens yet</p>
                </div>
              ) : filteredSaved.length === 0 ? (
                <div className="py-8 text-center bg-surface border border-ui text-label-caps text-muted">
                  No tokens match your filter.
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    {paginatedSaved.map(token => {
                      const { iconNode, bgClass } = tokenIcon(token.symbol);
                      return (
                        <div key={token.address} className="bg-surface hover:bg-input-field p-4 flex items-center justify-between group transition-colors border border-ui">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className={`w-10 h-10 flex shrink-0 items-center justify-center text-xs font-bold ${bgClass}`}>
                              {iconNode}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold font-brand uppercase tracking-tighter text-main truncate">{token.symbol}</div>
                              <div className="text-[10px] text-sub uppercase tracking-tight truncate opacity-80">{token.name}</div>
                              <div className="text-[10px] text-sub font-mono truncate">{shortenAddress(token.address)}</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemove(token.address)}
                            className="shrink-0 p-2 text-muted hover:text-red-500 transition-colors md:opacity-0 md:group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 px-1 border-t border-ui">
                      <button
                        type="button"
                        disabled={listPage <= 1}
                        onClick={() => setListPage(p => Math.max(1, p - 1))}
                        className="text-[10px] font-bold uppercase tracking-widest text-brand-cyan disabled:opacity-25 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="text-[10px] text-muted font-mono">
                        {listPage} / {totalPages} · {filteredSaved.length} tokens
                      </span>
                      <button
                        type="button"
                        disabled={listPage >= totalPages}
                        onClick={() => setListPage(p => Math.min(totalPages, p + 1))}
                        className="text-[10px] font-bold uppercase tracking-widest text-brand-cyan disabled:opacity-25 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
      
      <div className="p-6 border-t border-ui">
        <div className="text-[9px] text-muted font-mono leading-relaxed uppercase opacity-50">
          Please verify the contract address before adding.
        </div>
      </div>
    </div>
  );
}
