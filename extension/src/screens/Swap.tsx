import { ArrowLeft, RefreshCw, Settings2 } from 'lucide-react';

interface Props {
  onBack: () => void;
}

export default function SwapScreen({ onBack }: Props) {
  return (
    <div className="w-[360px] h-[600px] bg-app text-main font-sans flex flex-col relative overflow-hidden">
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
            <div className="text-3xl font-brand font-bold text-muted">0.00</div>
            <div className="bg-app border border-ui px-3 py-1 text-sm font-bold flex items-center gap-2">
              <div className="w-4 h-4 bg-slate-700 rounded-full" />
              ETH
            </div>
          </div>
        </div>

        <div className="flex justify-center -my-3 relative z-20">
          <div className="bg-surface border border-ui p-2 text-brand-cyan">
            <RefreshCw className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-surface border border-ui p-4 relative">
          <div className="text-label-caps text-sub mb-2">You Receive</div>
          <div className="flex justify-between items-center">
            <div className="text-3xl font-brand font-bold text-muted">0.00</div>
            <div className="bg-app border border-ui px-3 py-1 text-sm font-bold flex items-center gap-2">
              <div className="w-4 h-4 bg-brand-cyan rounded-full" />
              USDC
            </div>
          </div>
        </div>
        
        <div className="pt-6">
          <button className="w-full bg-input-field text-sub py-4 text-label-caps font-bold cursor-not-allowed">
            Review Swap
          </button>
        </div>
      </main>

      {/* Coming Soon Overlay */}
      <div className="absolute inset-x-0 bottom-0 top-[80px] z-50 backdrop-blur-sm bg-app/80 flex flex-col items-center justify-center p-6 text-center border-t border-ui">
        <div className="w-16 h-16 bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center mb-6">
          <RefreshCw className="w-8 h-8 text-brand-cyan" />
        </div>
        <h2 className="text-2xl font-brand font-bold uppercase tracking-tighter mb-2 text-brand-cyan glow-cyan">
          In-Wallet Swaps
        </h2>
        <p className="text-sm tracking-wide text-sub mb-8 leading-relaxed">
          We are integrating a decentralized Fhenix router to allow seamless, confidential tokens swaps directly within NixWallet.
        </p>
        <div className="px-6 py-2 bg-brand-cyan text-brand-midnight text-label-caps font-bold shadow-[0_0_15px_rgba(34,211,238,0.4)]">
          Coming Soon
        </div>
      </div>
    </div>
  );
}
