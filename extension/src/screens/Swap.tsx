import { useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, Settings2 } from 'lucide-react';
import { mockSwapAdapter, type SwapQuote, type SwapTokenOption } from '../lib/swapAdapter';

interface Props {
  onBack: () => void;
}

export default function SwapScreen({ onBack }: Props) {
  const tokens = useMemo<SwapTokenOption[]>(
    () => [
      { symbol: 'ETH', address: 'native', decimals: 18 },
      { symbol: 'USDC', address: '0xUSDC', decimals: 6 },
      { symbol: 'USDT', address: '0xUSDT', decimals: 6 },
    ],
    []
  );
  const [fromToken, setFromToken] = useState(tokens[0]);
  const [toToken, setToToken] = useState(tokens[1]);
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(50);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [status, setStatus] = useState<string>('');

  const fetchQuote = async () => {
    setStatus('Fetching quote...');
    try {
      const q = await mockSwapAdapter.getQuote({
        fromToken,
        toToken,
        amount,
        slippageBps,
      });
      setQuote(q);
      setStatus('Quote ready (execution disabled in Wave 3)');
    } catch (e: unknown) {
      setQuote(null);
      setStatus(e instanceof Error ? e.message : 'Unable to fetch quote');
    }
  };

  const swapSides = () => {
    const nextFrom = toToken;
    const nextTo = fromToken;
    setFromToken(nextFrom);
    setToToken(nextTo);
    setQuote(null);
  };

  return (
    <div className="w-full min-h-screen bg-app text-main font-sans flex flex-col relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-[-100px] right-[-100px] w-64 h-64 bg-brand-cyan/5 mix-blend-screen filter blur-[100px]" />

      {/* Header */}
      <header className="w-full p-6 flex items-center justify-between relative z-10 border-b border-ui">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-sub hover:text-brand-cyan transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold font-brand uppercase tracking-tighter">Swap</h1>
        </div>
        <button className="text-sub hover:text-main transition-colors">
          <Settings2 className="w-4 h-4" />
        </button>
      </header>

      {/* Mock Content */}
      <main className="flex-1 p-6 relative z-10 space-y-2">
        <div className="bg-surface border border-ui p-4 relative">
          <div className="text-label-caps text-sub mb-2">You Pay</div>
          <div className="flex justify-between items-center">
            <input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setQuote(null);
              }}
              placeholder="0.00"
              className="w-1/2 bg-transparent text-3xl font-brand font-bold text-main outline-none"
            />
            <select
              value={fromToken.symbol}
              onChange={(e) => {
                const next = tokens.find((t) => t.symbol === e.target.value);
                if (!next) return;
                setFromToken(next);
                if (next.symbol === toToken.symbol) {
                  const alt = tokens.find((t) => t.symbol !== next.symbol);
                  if (alt) setToToken(alt);
                }
                setQuote(null);
              }}
              className="bg-app border border-ui px-3 py-1 text-sm font-bold"
            >
              {tokens.map((token) => (
                <option key={token.symbol} value={token.symbol}>{token.symbol}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-center -my-3 relative z-20">
          <button onClick={swapSides} className="bg-surface border border-ui p-2 text-brand-cyan">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-surface border border-ui p-4 relative">
          <div className="text-label-caps text-sub mb-2">You Receive</div>
          <div className="flex justify-between items-center">
            <div className="text-3xl font-brand font-bold text-main">{quote?.outputAmount || '0.00'}</div>
            <select
              value={toToken.symbol}
              onChange={(e) => {
                const next = tokens.find((t) => t.symbol === e.target.value);
                if (!next) return;
                setToToken(next);
                if (next.symbol === fromToken.symbol) {
                  const alt = tokens.find((t) => t.symbol !== next.symbol);
                  if (alt) setFromToken(alt);
                }
                setQuote(null);
              }}
              className="bg-app border border-ui px-3 py-1 text-sm font-bold"
            >
              {tokens.map((token) => (
                <option key={token.symbol} value={token.symbol}>{token.symbol}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-surface border border-ui p-4 text-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sub text-xs uppercase tracking-wider">Slippage</span>
            <select
              value={slippageBps}
              onChange={(e) => {
                setSlippageBps(Number(e.target.value));
                setQuote(null);
              }}
              className="bg-app border border-ui px-2 py-1 text-xs"
            >
              <option value={30}>0.3%</option>
              <option value={50}>0.5%</option>
              <option value={100}>1.0%</option>
            </select>
          </div>
          <div className="text-[10px] text-sub min-h-[16px]">{status}</div>
          {quote && (
            <div className="text-[11px] text-sub space-y-1">
              <div>Rate: 1 {fromToken.symbol} ≈ {quote.rate.toFixed(6)} {toToken.symbol}</div>
              <div>Price impact: {(quote.priceImpactBps / 100).toFixed(2)}%</div>
              <div>Provider: {quote.provider}</div>
            </div>
          )}
        </div>
        
        <div className="pt-6">
          <button
            onClick={fetchQuote}
            className="w-full bg-brand-cyan/10 text-brand-cyan py-4 text-label-caps font-bold border border-brand-cyan/20"
          >
            Get Quote
          </button>
        </div>

        <div>
          <button className="w-full bg-input-field text-sub py-4 text-label-caps font-bold cursor-not-allowed">
            Review Swap (Execution Disabled)
          </button>
        </div>
      </main>
    </div>
  );
}
