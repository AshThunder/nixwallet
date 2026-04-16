import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ArrowLeft, Eye, EyeOff, Copy, Check, AlertCircle, ArrowRight } from 'lucide-react';
import { createNewWallet, restoreFromMnemonic } from '../lib/wallet';
import { createVault } from '../lib/vault';

interface Props {
  onComplete: (address: string) => void;
}

type Step = 'welcome' | 'create-password' | 'show-mnemonic' | 'import';

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [importMnemonic, setImportMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleCreate = () => {
    const wallet = createNewWallet();
    setMnemonic(wallet.mnemonic);
    setPrivateKey(wallet.privateKey);
    setAddress(wallet.address);
    setStep('show-mnemonic');
  };

  const handleSetPassword = async () => {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await createVault({ mnemonic, privateKey }, password);
      onComplete(address);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An error occurred');
    }
    setLoading(false);
  };

  const handleImportSubmit = async () => {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const wallet = restoreFromMnemonic(importMnemonic.trim());
      await createVault({ mnemonic: wallet.mnemonic, privateKey: wallet.privateKey }, password);
      onComplete(wallet.address);
    } catch {
      setError('Invalid recovery phrase. Please check and try again.');
    }
    setLoading(false);
  };

  const mnemonicWords = useMemo(() => mnemonic.split(' '), [mnemonic]);

  const copyMnemonic = () => {
    navigator.clipboard.writeText(mnemonic);
    setMnemonicCopied(true);
    setTimeout(() => setMnemonicCopied(false), 2000);
  };

  return (
    <div className="w-full min-h-screen overflow-hidden bg-app text-main font-sans relative flex flex-col">
      {/* Background Layer */}
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />
      <div className="absolute top-[-100px] left-[-100px] w-80 h-80 bg-brand-cyan/10 rounded-full blur-[120px] pointer-events-none" />
      
      <AnimatePresence mode="wait">
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col p-8 relative z-10"
          >
            <div className="flex justify-between items-center mb-12">
              <span className="text-[10px] font-brand tracking-[0.3em] text-brand-cyan uppercase">NixWallet</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-brand-cyan glow-cyan" />
                <span className="text-[8px] font-mono text-brand-cyan/60 uppercase tracking-widest">Ready</span>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center text-center">
              {/* Central Iconography */}
              <div className="relative mb-16">
                 <div className="w-32 h-32 border border-brand-cyan/20 rotate-45 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                 <div className="w-24 h-24 border border-brand-cyan/40 -rotate-12 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                 <div className="w-16 h-16 bg-brand-cyan/10 flex items-center justify-center relative z-10">
                    <Shield className="w-8 h-8 text-brand-cyan" />
                 </div>
                 <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                     <span className="text-[8px] font-mono text-brand-cyan tracking-[0.2em] uppercase">Privacy-First Wallet</span>
                 </div>
              </div>

              <h1 className="text-[34px] font-brand font-bold leading-[1.1] tracking-tight text-main mb-6">
                Your Private<br/>
                <span className="text-brand-cyan italic glow-text-cyan">Crypto Wallet</span><br/>
                on Fhenix
              </h1>

              <p className="text-[11px] text-sub leading-relaxed max-w-[260px] mb-12">
                Send, receive, and manage tokens with built-in privacy. Your balances stay hidden on-chain — only you can see them.
              </p>
            </div>

            <div className="space-y-2 mt-auto">
              <button
                onClick={handleCreate}
                className="w-full bg-brand-cyan text-brand-midnight py-5 text-label-caps font-bold shadow-[0_0_40px_rgba(10,217,220,0.15)] transition-all active:scale-[0.98]"
              >
                Create Wallet
              </button>
              <button
                onClick={() => setStep('import')}
                className="w-full bg-surface hover:bg-input-field border border-ui py-4 text-label-caps text-sub transition-all"
              >
                Import Wallet
              </button>
            </div>
            
            <div className="mt-8 flex justify-center gap-1">
               <div className="h-0.5 w-6 bg-brand-cyan" />
               <div className="h-0.5 w-6 bg-ui" />
               <div className="h-0.5 w-6 bg-ui" />
            </div>
          </motion.div>
        )}


        {step === 'show-mnemonic' && (
          <motion.div
            key="show-mnemonic"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col p-8 relative z-10 overflow-y-auto no-scrollbar"
          >
            <header className="flex justify-between items-center mb-10">
               <button onClick={() => setStep('welcome')} className="text-sub hover:text-brand-cyan transition-colors">
                  <ArrowLeft className="w-5 h-5" />
               </button>
               <div className="text-[9px] font-mono text-brand-cyan uppercase tracking-[0.3em]">Step 2 of 3</div>
            </header>

            <div className="mb-8">
               <div className="flex items-center gap-2 text-label-caps text-sub mb-2">
                  <div className="w-2 h-2 bg-brand-cyan shadow-[0_0_8px_rgba(10,217,220,0.4)]" />
                  Recovery Phrase
               </div>
               <h2 className="text-[32px] font-brand font-bold uppercase tracking-tighter text-main">Your Secret Words</h2>
            </div>

            <p className="text-[11px] text-sub leading-relaxed mb-8">
               Write down these 12 words in order and keep them somewhere safe. This is the only way to recover your wallet if you lose access. <span className="text-red-500 italic font-semibold">Never share these words with anyone.</span>
            </p>

            <div className="bg-brand-cyan/[0.02] border border-brand-cyan/20 p-8 mb-8 relative shrink-0">
               {/* Decorative Shield Background */}
               <Shield className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 text-brand-cyan/[0.03] pointer-events-none" />
               
                <div className="grid grid-cols-2 gap-x-10 gap-y-6 relative z-10">
                  {mnemonicWords.map((word, i) => (
                    <div key={i} className="flex items-center gap-4 border-b border-brand-cyan/10 pb-2">
                       <span className="text-[9px] font-mono text-brand-cyan/40 w-4">{String(i + 1).padStart(2, '0')}</span>
                       <span className="text-sm font-bold font-brand text-main tracking-wider uppercase">{word}</span>
                    </div>
                  ))}
               </div>
               
               <div className="mt-12 flex flex-col items-center gap-6 relative z-10">
                  <div className="flex items-center gap-2 bg-app border border-ui p-3">
                     <AlertCircle className="w-3 h-3 text-red-500/60" />
                     <span className="text-[8px] font-mono text-muted uppercase tracking-widest">Secured with AES-256 Encryption</span>
                  </div>
                  
                  <button 
                    onClick={copyMnemonic}
                    className="w-full bg-brand-cyan text-brand-midnight py-4 font-bold text-label-caps shadow-[0_0_20px_rgba(10,217,220,0.2)] flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
                  >
                    {mnemonicCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {mnemonicCopied ? 'Copied!' : 'Copy to Clipboard'}
                  </button>
               </div>
            </div>

            <div className="space-y-2 mt-8">
               <div className="bg-surface border border-ui p-4 flex justify-between items-center">
                  <span className="text-[8px] font-mono text-muted uppercase tracking-widest">Security Status</span>
                  <span className="text-[9px] font-bold text-brand-cyan uppercase tracking-[0.1em] glow-text-cyan">Strong</span>
               </div>
               <div className="bg-surface border border-ui p-4 flex justify-between items-center">
                  <span className="text-[8px] font-mono text-muted uppercase tracking-widest">Wallet Version</span>
                  <span className="text-[9px] font-bold text-sub uppercase tracking-[0.1em]">v1.0.0</span>
               </div>
            </div>

            <button
              onClick={() => setStep('create-password')}
              className="w-full mt-8 bg-brand-cyan text-brand-midnight py-5 text-label-caps font-bold shadow-[0_0_30px_rgba(10,217,220,0.15)] flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shrink-0"
            >
              I've Saved My Words <ArrowRight className="w-4 h-4" />
            </button>
            
            <div className="mt-6 flex justify-center gap-2 shrink-0">
               <div className="h-0.5 w-8 bg-ui" />
               <div className="h-0.5 w-8 bg-ui" />
               <div className="h-0.5 w-8 bg-brand-cyan shadow-[0_0_10px_rgba(10,217,220,0.5)]" />
            </div>
          </motion.div>
        )}

        {(step === 'create-password' || step === 'import') && (
          <motion.div
            key="password"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col p-8 relative z-10 overflow-y-auto no-scrollbar"
          >
            <button onClick={() => setStep(step === 'import' ? 'welcome' : 'show-mnemonic')} className="self-start text-sub hover:text-brand-cyan transition-colors mb-8">
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="mb-12">
               <div className="text-label-caps text-sub mb-2">■ Security Setup</div>
               <h2 className="text-3xl sm:text-[42px] font-brand font-bold uppercase tracking-tighter text-main leading-none break-all">Set Password</h2>
               <p className="text-[11px] text-sub mt-4 leading-relaxed">
                  Create a password to unlock your wallet on this device. Use at least 8 characters.
               </p>
            </div>

            <div className="space-y-8 flex-1">
              {step === 'import' && (
                 <div className="space-y-2">
                    <label className="text-[9px] font-mono text-muted uppercase tracking-widest px-1">Recovery Phrase</label>
                    <div className="bg-surface border border-ui p-4 focus-within:border-brand-cyan transition-colors">
                       <textarea
                          value={importMnemonic}
                          onChange={e => setImportMnemonic(e.target.value)}
                          placeholder="Enter your 12-word phrase here..."
                          className="w-full bg-transparent text-xs text-main font-mono placeholder:text-muted focus:outline-none resize-none"
                          rows={2}
                       />
                    </div>
                 </div>
              )}

              <div className="space-y-6">
                <div className="space-y-2">
                   <div className="flex justify-between items-center px-1">
                      <label className="text-[9px] font-mono text-muted uppercase tracking-widest">New Password</label>
                      <button onClick={() => setShowPassword(!showPassword)} className="text-muted hover:text-brand-cyan transition-colors">
                         {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                   </div>
                   <div className="bg-surface border border-ui p-5 focus-within:border-brand-cyan transition-colors relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-transparent text-lg text-brand-cyan font-mono placeholder:text-muted focus:outline-none tracking-widest"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-mono text-muted">Min 8 chars</div>
                   </div>
                </div>

                <div className="space-y-2">
                   <div className="flex justify-between items-center px-1">
                      <label className="text-[9px] font-mono text-muted uppercase tracking-widest">Confirm Entry</label>
                   </div>
                   <div className="bg-surface border border-ui p-5 focus-within:border-brand-cyan transition-colors relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-transparent text-lg text-brand-cyan font-mono placeholder:text-muted focus:outline-none tracking-widest"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[8px] font-mono text-muted">Must match</div>
                   </div>
                </div>
              </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <span className="text-[8px] font-mono text-muted uppercase tracking-widest">■ Strength</span>
                     <div className="h-1 bg-ui overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${password.length >= 8 ? 'bg-brand-cyan w-full shadow-[0_0_10px_rgba(10,217,220,0.5)]' : 'bg-brand-cyan/20 w-1/3'}`} 
                        />
                     </div>
                  </div>
                  <div className="space-y-2">
                     <span className="text-[8px] font-mono text-muted uppercase tracking-widest">■ Complexity</span>
                     <div className="h-1 bg-ui overflow-hidden">
                        <div 
                           className={`h-full transition-all duration-500 ${password.length >= 16 ? 'bg-brand-cyan w-full shadow-[0_0_10px_rgba(10,217,220,0.5)]' : 'bg-brand-cyan/20 w-1/4'}`} 
                        />
                     </div>
                  </div>
               </div>
            </div>

            {error && (
              <div className="mt-8 p-4 bg-red-500/5 border-l-2 border-red-500 flex items-center gap-3">
                 <AlertCircle className="w-4 h-4 text-red-500" />
                 <span className="text-[9px] font-bold text-red-500 uppercase tracking-widest">{error}</span>
              </div>
            )}

            <div className="mt-auto pt-8 flex flex-col gap-4">
               <button
                  onClick={step === 'import' ? handleImportSubmit : handleSetPassword}
                  disabled={loading || password.length < 8}
                  className="w-full bg-brand-cyan text-brand-midnight py-5 text-label-caps font-bold shadow-[0_0_30px_rgba(10,217,220,0.1)] disabled:opacity-20 flex items-center justify-center gap-3"
               >
                  {loading ? 'Creating...' : 'Create Wallet'} <ArrowRight className="w-4 h-4" />
               </button>
               <div className="flex justify-between items-center px-1">
                  <span className="text-[8px] font-mono text-muted uppercase tracking-widest">All data stored locally</span>
                  <span className="text-[8px] font-mono text-muted uppercase tracking-widest">v1.0.0</span>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
