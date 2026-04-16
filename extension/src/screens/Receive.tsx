import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Copy, Check, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  address: string;
  onBack: () => void;
}

export default function Receive({ address, onBack }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'NixWallet Address',
          text: address,
        });
      } catch { /* share cancelled or unsupported */ }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="w-full min-h-screen overflow-hidden bg-app text-main font-sans relative flex flex-col">
      <div className="absolute top-[-100px] left-[-100px] w-64 h-64 bg-brand-cyan/10 mix-blend-screen filter blur-[100px]" />

      <header className="w-full p-6 flex items-center gap-4 relative z-10 border-b border-ui">
        <button onClick={onBack} className="text-sub hover:text-brand-cyan transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold font-brand uppercase tracking-tighter">Receive</h1>
      </header>

      <main className="flex-1 w-full px-8 pt-12 relative z-10 flex flex-col items-center">
        <div className="text-center mb-8">
          <p className="text-[10px] font-bold text-muted uppercase tracking-[0.2em] mb-2">Scan to receive tokens</p>
          <div className="w-[220px] h-[220px] bg-white p-4 shadow-[0_0_50px_rgba(10,217,220,0.15)] mx-auto relative group">
            <div className="absolute -inset-1 border border-brand-cyan/30 opacity-0 group-hover:opacity-100 transition-opacity" />
            <QRCodeSVG 
              value={address} 
              size={188} 
              level="H"
              includeMargin={false}
              fgColor="#0A0B0D"
            />
          </div>
        </div>

        <div className="w-full space-y-4">
          <div className="p-4 bg-surface border border-ui text-center">
            <p className="text-[9px] font-bold text-muted uppercase tracking-widest mb-2">Your Wallet Address</p>
            <p className="text-xs font-mono break-all text-main px-2 selection:bg-brand-cyan/30">
              {address}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 bg-surface border border-ui hover:bg-input-field py-4 transition-all flex items-center justify-center gap-2 text-label-caps"
            >
              <AnimatePresence mode="wait">
                {copied ? (
                  <motion.div
                    key="check"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    className="flex items-center gap-2 text-brand-cyan"
                  >
                    <Check className="w-4 h-4" /> Copied
                  </motion.div>
                ) : (
                  <motion.div
                    key="copy"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    className="flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" /> Copy Address
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
            <button
              onClick={handleShare}
              className="px-6 bg-surface border border-ui hover:bg-input-field transition-all flex items-center justify-center"
            >
              <Share2 className="w-4 h-4 text-sub" />
            </button>
          </div>
        </div>
      </main>

      <div className="p-8 text-center relative z-10">
        <p className="text-[9px] text-muted font-bold uppercase tracking-widest leading-relaxed">
          Make sure to only send assets on <span className="text-brand-cyan">Ethereum Sepolia</span> to this address.
        </p>
      </div>
    </div>
  );
}
