import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Search, Trash2, Loader2, AlertCircle, CheckCircle, Bitcoin, DollarSign } from 'lucide-react';
import { getProvider, shortenAddress } from '../lib/wallet';
import { ethers } from 'ethers';

interface TokenMetadata {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}

interface Props {
  network: any;
  onBack: () => void;
}

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

export default function ManageTokens({ network, onBack }: Props) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [customTokens, setCustomTokens] = useState<TokenMetadata[]>([]);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadTokens();
  }, [network.id]);

  const loadTokens = async () => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const key = `custom_tokens_${network.id}`;
      const res = await chrome.storage.local.get([key]);
      const tokens = res[key] as TokenMetadata[];
      setCustomTokens(tokens || []);
    }
  };

  const saveTokens = async (tokens: TokenMetadata[]) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const key = `custom_tokens_${network.id}`;
      await chrome.storage.local.set({ [key]: tokens });
    }
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
    } catch (e) {
      console.error(e);
      setError('Could not fetch token data. Is this an ERC-20 contract?');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!metadata) return;
    const newTokens = [...customTokens, metadata];
    await saveTokens(newTokens);
    setMetadata(null);
    setAddress('');
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const handleRemove = async (addr: string) => {
    const newTokens = customTokens.filter(t => t.address.toLowerCase() !== addr.toLowerCase());
    await saveTokens(newTokens);
  };

  return (
    <div className="w-[360px] h-[600px] bg-app text-main font-sans flex flex-col relative overflow-hidden">
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
              placeholder="Contract Address OR Name"
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

        {/* Token List */}
        <section>
          <div className="text-label-caps text-muted mb-4 px-1">Saved Tokens ({customTokens.length})</div>
          <div className="space-y-1">
            {customTokens.length === 0 ? (
              <div className="py-12 text-center bg-surface border border-ui">
                <p className="text-label-caps text-muted">No Custom Assets Found</p>
              </div>
            ) : (
              customTokens.map(token => {
                let iconNode: React.ReactNode = token.symbol[0];
                let bgClass = 'bg-ui text-main';
                
                if (token.symbol === 'USDT') {
                  iconNode = <DollarSign className="w-5 h-5 text-emerald-500" />;
                  bgClass = 'bg-emerald-500/10';
                } else if (token.symbol === 'USDC') {
                  iconNode = <DollarSign className="w-5 h-5 text-blue-500" />;
                  bgClass = 'bg-blue-500/10';
                } else if (token.symbol === 'WBTC') {
                  iconNode = <Bitcoin className="w-5 h-5 text-orange-500" />;
                  bgClass = 'bg-orange-500/10';
                }

                return (
                  <div key={token.address} className="bg-surface hover:bg-input-field p-4 flex items-center justify-between group transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 flex items-center justify-center text-xs font-bold ${bgClass}`}>
                        {iconNode}
                      </div>
                      <div>
                        <div className="text-sm font-bold font-brand uppercase tracking-tighter text-main">{token.symbol}</div>
                        <div className="text-[10px] text-sub font-mono">{shortenAddress(token.address)}</div>
                      </div>
                    </div>
                  <button
                    onClick={() => handleRemove(token.address)}
                    className="p-2 text-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )})
            )}
          </div>
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
