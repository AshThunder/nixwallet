import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Plus, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { shortenAddress } from '../lib/wallet';
import { ethers } from 'ethers';

interface Props {
  open: boolean;
  onClose: () => void;
  address: string;
  mnemonic?: string;
  accountIndex?: number;
  accountCount: number;
  importedAccounts?: { address: string; privateKey: string; name?: string }[];
  onAccountChange?: (arg: number | string) => void;
  onImportAccount?: (acc: { address: string; privateKey: string; name?: string }, password: string) => Promise<boolean>;
  onAddHD: (newCount: number) => void;
}

export default function AccountPicker({
  open, onClose, address, mnemonic, accountIndex, accountCount,
  importedAccounts, onAccountChange, onImportAccount, onAddHD,
}: Props) {
  const [isImporting, setIsImporting] = useState(false);
  const [importPK, setImportPK] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [importError, setImportError] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-[300px] bg-app border border-ui rounded-3xl overflow-hidden shadow-card max-h-[85vh] flex flex-col"
          >
            <div className="p-5 border-b border-ui shrink-0 flex justify-between items-center bg-app z-10">
              <h3 className="text-lg font-bold text-main">Select Account</h3>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-ui transition-colors">
                <X className="w-4 h-4 text-sub" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 min-h-0 relative">
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 px-2">HD Wallets</h3>
              <div className="space-y-2 mb-6">
                {Array.from({ length: accountCount }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => { onAccountChange?.(idx); onClose(); }}
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
                        onClick={() => { onAccountChange?.(acc.address); onClose(); }}
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
                        onAddHD(newCount);
                        onAccountChange?.(newCount - 1);
                        onClose();
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
                          onClose();
                          setIsImporting(false);
                          setImportPK('');
                          setImportPassword('');
                        } else {
                          setImportError('Incorrect password');
                        }
                      } catch {
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
  );
}
