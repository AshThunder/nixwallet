import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, ArrowRight } from 'lucide-react';
import { unlockVault } from '../lib/vault';
import type { VaultData } from '../lib/vault';

interface Props {
  onUnlock: (data: VaultData) => void;
}

export default function UnlockScreen({ onUnlock }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await unlockVault(password);
      onUnlock(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Access Denied: Invalid Key Sequence');
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleUnlock();
  };

  return (
    <div className="w-full min-h-screen overflow-hidden bg-app text-main font-sans flex flex-col items-center justify-center relative">
      <div className="absolute top-[-100px] left-[-100px] w-64 h-64 bg-brand-cyan/10 mix-blend-screen filter blur-[100px]" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full px-8 relative z-10"
      >
        <div className="flex flex-col mb-10">
          <div className="w-12 h-12 bg-brand-cyan flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(10,217,220,0.2)]">
            <Shield className="w-7 h-7 text-brand-midnight" />
          </div>
          <div className="text-label-caps text-brand-cyan mb-2">Unlock Wallet</div>
          <h1 className="text-3xl font-bold font-brand tracking-tighter uppercase leading-none">
            Welcome<br/>Back
          </h1>
          <p className="text-sub text-[10px] mt-4 font-label-caps tracking-widest uppercase">Enter password to unlock wallet</p>
        </div>

        <div className="space-y-6">
          <div className="bg-surface border-l-2 border-brand-cyan p-4 transition-all focus-within:bg-input-field">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Password"
              autoFocus
              className="w-full bg-transparent text-sm placeholder:text-muted focus:outline-none focus:text-brand-cyan transition-colors uppercase font-mono"
            />
          </div>
          
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-[10px] font-bold uppercase tracking-widest"
            >
              {error}
            </motion.p>
          )}

          <button
            onClick={handleUnlock}
            disabled={loading || !password}
            className="w-full bg-brand-cyan text-brand-midnight py-5 text-label-caps font-bold shadow-[0_0_20px_rgba(10,217,220,0.2)] disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted disabled:border disabled:border-ui disabled:shadow-none flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
          >
            {loading ? 'Unlocking...' : 'Unlock'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-12 pt-8 border-t border-ui">
          <div className="text-[10px] text-muted font-label-caps tracking-tighter leading-relaxed uppercase">
            System Status: <span className="text-brand-cyan">Ready</span><br/>
            Security: <span className="text-brand-cyan">Protected by encryption</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
