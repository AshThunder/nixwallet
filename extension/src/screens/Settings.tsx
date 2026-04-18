import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Globe, Trash2, Eye, EyeOff, AlertTriangle, Clock, ShieldCheck, 
  BookUser, Link as LinkIcon, Info, ChevronRight, Plus, Copy, Check
} from 'lucide-react';
import { FHENIX_NETWORKS, getActiveNetwork } from '../lib/wallet';
import type { NetworkId } from '../lib/wallet';
import { resetVault, unlockVault } from '../lib/vault';
import { clearActivities } from '../lib/activity';
import { getContacts, saveContact, deleteContact, type Contact } from '../lib/contacts';

interface Props {
  address: string;
  mnemonic: string;
  onBack: () => void;
  onReset: () => void;
  onNetworkChange: (id: NetworkId) => void;
  onNavigate?: (s: string) => void;
}

const TIMEOUT_OPTIONS = [
  { label: '5M', value: 5 * 60 * 1000 },
  { label: '10M', value: 10 * 60 * 1000 },
  { label: '30M', value: 30 * 60 * 1000 },
];

type SettingsTab = 'menu' | 'security' | 'addressBook' | 'networks' | 'about';

export default function SettingsScreen({ mnemonic, onBack, onReset, onNetworkChange, onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('menu');
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonicPassword, setMnemonicPassword] = useState('');
  const [mnemonicPasswordError, setMnemonicPasswordError] = useState('');
  const [mnemonicPrompting, setMnemonicPrompting] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [autoLockTimeout, setAutoLockTimeout] = useState(10 * 60 * 1000);
  const network = getActiveNetwork();

  // Unified address book via contacts.ts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newAddrName, setNewAddrName] = useState('');
  const [newAddrVal, setNewAddrVal] = useState('');

  useEffect(() => {
    chrome.storage.local.get(['autoLockTimeout']).then((res) => {
      if (typeof res.autoLockTimeout === 'number') setAutoLockTimeout(res.autoLockTimeout);
    });

    // Load contacts and migrate legacy addressBook data if present
    (async () => {
      const existing = await getContacts();

      const legacy = await chrome.storage.local.get(['addressBook']);
      if (legacy.addressBook && Array.isArray(legacy.addressBook) && legacy.addressBook.length > 0) {
        for (const entry of legacy.addressBook) {
          if (entry.address && !existing.find(c => c.address.toLowerCase() === entry.address.toLowerCase())) {
            await saveContact({ address: entry.address, name: entry.name || '' });
          }
        }
        await chrome.storage.local.remove('addressBook');
        setContacts(await getContacts());
      } else {
        setContacts(existing);
      }
    })();
  }, []);

  const handleNetworkSwitch = (id: NetworkId) => {
    onNetworkChange(id);
  };

  const handleSetTimeout = async (timeout: number) => {
    setAutoLockTimeout(timeout);
    await chrome.storage.local.set({ autoLockTimeout: timeout });
  };

  const handleReset = async () => {
    await resetVault();
    onReset();
  };

  const handleSaveAddress = async () => {
    if (!newAddrName || !newAddrVal) return;
    await saveContact({ address: newAddrVal, name: newAddrName });
    setContacts(await getContacts());
    setIsAddingAddress(false);
    setNewAddrName('');
    setNewAddrVal('');
  };

  const handleRemoveAddress = async (addr: string) => {
    await deleteContact(addr);
    setContacts(await getContacts());
  };

  const renderMainMenu = () => (
    <div className="space-y-2">
      <button onClick={() => setActiveTab('security')} className="w-full flex items-center justify-between p-4 bg-surface border border-ui hover:border-brand-cyan hover:text-brand-cyan transition-colors group">
        <div className="flex items-center gap-4">
          <ShieldCheck className="w-5 h-5 text-brand-cyan" />
          <span className="font-bold tracking-tight">Security & Privacy</span>
        </div>
        <ChevronRight className="w-4 h-4 text-sub group-hover:text-brand-cyan" />
      </button>

      <button onClick={() => setActiveTab('addressBook')} className="w-full flex items-center justify-between p-4 bg-surface border border-ui hover:border-brand-cyan hover:text-brand-cyan transition-colors group">
        <div className="flex items-center gap-4">
          <BookUser className="w-5 h-5 text-brand-cyan" />
          <span className="font-bold tracking-tight">Address Book</span>
        </div>
        <ChevronRight className="w-4 h-4 text-sub group-hover:text-brand-cyan" />
      </button>

      <button onClick={() => setActiveTab('networks')} className="w-full flex items-center justify-between p-4 bg-surface border border-ui hover:border-brand-cyan hover:text-brand-cyan transition-colors group">
        <div className="flex items-center gap-4">
          <Globe className="w-5 h-5 text-brand-cyan" />
          <span className="font-bold tracking-tight">Networks</span>
        </div>
        <ChevronRight className="w-4 h-4 text-sub group-hover:text-brand-cyan" />
      </button>

      <button onClick={() => onNavigate?.('dapps')} className="w-full flex items-center justify-between p-4 bg-surface border border-ui hover:border-brand-cyan hover:text-brand-cyan transition-colors group">
        <div className="flex items-center gap-4">
          <LinkIcon className="w-5 h-5 text-brand-cyan" />
          <span className="font-bold tracking-tight">Connected DApps</span>
        </div>
        <ChevronRight className="w-4 h-4 text-sub group-hover:text-brand-cyan" />
      </button>

      <button onClick={() => setActiveTab('about')} className="w-full flex items-center justify-between p-4 bg-surface border border-ui hover:border-brand-cyan hover:text-brand-cyan transition-colors group">
        <div className="flex items-center gap-4">
          <Info className="w-5 h-5 text-brand-cyan" />
          <span className="font-bold tracking-tight">About</span>
        </div>
        <ChevronRight className="w-4 h-4 text-sub group-hover:text-brand-cyan" />
      </button>
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-6">
      <div className="bg-surface p-4 border border-ui">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-brand-cyan" />
            <div className="text-label-caps text-main">Auto-Lock Timer</div>
          </div>
        </div>
        <div className="flex bg-app p-1 border border-ui">
          {TIMEOUT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleSetTimeout(opt.value)}
              className={`flex-1 py-2 text-label-caps transition-all ${
                autoLockTimeout === opt.value
                  ? 'bg-brand-cyan text-brand-midnight font-bold'
                  : 'text-sub hover:text-main'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface p-4 border border-ui">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-4 h-4 text-brand-cyan" />
            <span className="text-label-caps text-main">Secret Phrase</span>
          </div>
          <button
            onClick={() => {
              if (showMnemonic) {
                setShowMnemonic(false);
                setMnemonicPrompting(false);
              } else {
                setMnemonicPrompting(true);
                setMnemonicPassword('');
                setMnemonicPasswordError('');
              }
            }}
            className="text-sub hover:text-brand-cyan transition-colors"
          >
            {showMnemonic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {mnemonicPrompting && !showMnemonic && (
          <div className="space-y-3 mb-3">
            <input
              type="password"
              value={mnemonicPassword}
              onChange={e => { setMnemonicPassword(e.target.value); setMnemonicPasswordError(''); }}
              placeholder="Enter wallet password to reveal"
              className="w-full bg-app border border-ui px-4 py-3 text-sm focus:outline-none focus:border-brand-cyan transition-colors"
              onKeyDown={async (e) => {
                if (e.key !== 'Enter' || !mnemonicPassword) return;
                try {
                  await unlockVault(mnemonicPassword);
                  setShowMnemonic(true);
                  setMnemonicPrompting(false);
                  setTimeout(() => { setShowMnemonic(false); }, 30000);
                } catch {
                  setMnemonicPasswordError('Incorrect password');
                }
              }}
            />
            {mnemonicPasswordError && <p className="text-[10px] text-red-500">{mnemonicPasswordError}</p>}
            <button
              onClick={async () => {
                if (!mnemonicPassword) return;
                try {
                  await unlockVault(mnemonicPassword);
                  setShowMnemonic(true);
                  setMnemonicPrompting(false);
                  setTimeout(() => { setShowMnemonic(false); }, 30000);
                } catch {
                  setMnemonicPasswordError('Incorrect password');
                }
              }}
              className="w-full py-2 bg-brand-cyan text-brand-midnight font-bold text-label-caps"
            >
              Verify & Reveal
            </button>
          </div>
        )}
        {showMnemonic ? (
          <div className="relative">
            <div className="bg-app border border-ui p-4 text-[10px] font-mono text-main leading-relaxed border-l-2 border-l-brand-cyan border-y-ui border-r-ui pr-10">
              {mnemonic}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(mnemonic);
                setMnemonicCopied(true);
                setTimeout(() => setMnemonicCopied(false), 2000);
              }}
              className="absolute top-2 right-2 p-1.5 text-sub hover:text-brand-cyan transition-colors"
            >
              {mnemonicCopied ? <Check className="w-3.5 h-3.5 text-brand-cyan" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <div className="text-[9px] text-muted mt-2 px-1">Auto-hides in 30 seconds</div>
          </div>
        ) : !mnemonicPrompting ? (
          <div className="bg-app border border-ui p-4 text-[10px] font-mono text-muted tracking-[0.2em]">
            •••• •••• •••• •••• •••• ••••
          </div>
        ) : null}
      </div>

      <div className="bg-surface p-4 border border-ui">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trash2 className="w-4 h-4 text-brand-cyan" />
            <span className="text-label-caps text-main">Transaction History</span>
          </div>
          <button
            onClick={async () => {
              await clearActivities();
            }}
            className="text-label-caps text-sub hover:text-red-500 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="pt-8 border-t border-ui">
        <div className="flex items-center gap-3 mb-4 px-1">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="text-label-caps text-red-500 font-bold">Danger Zone</span>
        </div>
        {!showResetConfirm ? (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="w-full bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 text-red-500 py-4 text-label-caps font-bold transition-all flex items-center justify-center gap-3"
          >
            <Trash2 className="w-4 h-4" /> Delete Wallet Data
          </button>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-red-500/10 text-[9px] text-red-500 font-mono leading-relaxed uppercase">
              THIS WILL PERMANENTLY ERASE YOUR WALLET DATA. MAKE SURE YOU HAVE SAVED YOUR SECRET PHRASE.
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-4 bg-surface text-label-caps text-sub hover:text-main transition-colors border border-ui"
              >
                Abort
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-4 bg-red-600 border border-red-600 text-white text-label-caps font-bold transition-colors"
              >
                Delete All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderAddressBook = () => (
    <div className="space-y-4">
      {isAddingAddress ? (
        <div className="bg-surface border border-ui p-4 space-y-4">
          <input
            value={newAddrName}
            onChange={e => setNewAddrName(e.target.value)}
            placeholder="Name (e.g. Alice)"
            className="w-full bg-app border border-ui px-4 py-3 text-sm focus:outline-none focus:border-brand-cyan transition-colors"
          />
          <input
            value={newAddrVal}
            onChange={e => setNewAddrVal(e.target.value)}
            placeholder="0x..."
            className="w-full bg-app border border-ui px-4 py-3 text-sm font-mono focus:outline-none focus:border-brand-cyan transition-colors"
          />
          <div className="flex gap-2">
            <button onClick={() => setIsAddingAddress(false)} className="flex-1 py-2 text-sub border border-transparent hover:border-ui">Cancel</button>
            <button onClick={handleSaveAddress} className="flex-1 py-2 bg-brand-cyan text-brand-midnight font-bold">Save</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setIsAddingAddress(true)} className="w-full py-4 bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/20 hover:bg-brand-cyan/20 transition-all font-bold flex items-center justify-center gap-2 text-sm uppercase tracking-wider">
          <Plus className="w-4 h-4" /> Add Address
        </button>
      )}

      {contacts.map(c => (
        <div key={c.address} className="bg-surface border border-ui p-4 flex justify-between items-center group hover:border-brand-cyan/50 transition-colors">
          <div>
            <div className="font-bold text-sm">{c.name}</div>
            <div className="text-xs font-mono text-sub mt-1">{c.address.slice(0, 8)}...{c.address.slice(-6)}</div>
          </div>
          <button onClick={() => handleRemoveAddress(c.address)} className="p-2 text-sub hover:text-red-500 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      
      {contacts.length === 0 && !isAddingAddress && (
        <div className="text-center py-8 text-sub text-sm">
          No addresses saved yet.
        </div>
      )}
    </div>
  );

  const renderNetworks = () => (
    <div className="space-y-1">
      {(Object.keys(FHENIX_NETWORKS) as NetworkId[]).map(id => {
        const net = FHENIX_NETWORKS[id];
        const isActive = id === network.id;
        const isComingSoon = 'isComingSoon' in net && net.isComingSoon;

        return (
          <button
            key={id}
            onClick={() => !isComingSoon && handleNetworkSwitch(id)}
            disabled={isComingSoon}
            className={`w-full flex items-center justify-between p-4 transition-all border-l-2 ${
              isActive
                ? 'bg-brand-cyan/5 border-brand-cyan text-brand-cyan'
                : 'bg-surface border-transparent text-sub hover:bg-input-field'
            } ${isComingSoon ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center gap-4">
              <Globe className={`w-4 h-4 ${isActive ? 'text-brand-cyan glow-cyan' : 'text-muted'}`} />
              <div className="text-left">
                <div className="text-sm font-bold font-brand uppercase tracking-tighter">{net.name}</div>
                <div className="text-[9px] font-mono opacity-60 uppercase">{net.symbol}</div>
              </div>
            </div>
            {isComingSoon ? (
              <span className="text-[8px] font-bold text-muted uppercase tracking-widest px-2 py-0.5 border border-ui">Soon</span>
            ) : (
              <span className="text-[9px] text-muted font-mono">ID_{net.chainId}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  const renderAbout = () => (
    <div className="bg-surface border border-ui p-6 text-center space-y-6">
      <div className="w-16 h-16 mx-auto bg-brand-cyan/10 border border-brand-cyan flex items-center justify-center">
        <ShieldCheck className="w-8 h-8 text-brand-cyan glow-cyan" />
      </div>
      <div>
        <h2 className="text-xl font-brand font-bold uppercase tracking-tighter text-main">NixWallet</h2>
        <p className="text-xs text-sub font-mono tracking-widest mt-1">v1.0.1</p>
      </div>
      <p className="text-sm text-sub leading-relaxed">
        The premier confidential wallet powered by the Fhenix coFHE network. Built for privacy, speed, and seamless access to the decentralized web.
      </p>
      <div className="pt-4 border-t border-ui space-y-2">
        <a href="https://nixwallet.vercel.app" target="_blank" rel="noreferrer" className="block text-brand-cyan text-sm hover:underline">nixwallet.vercel.app</a>
        <a href="https://fhenix.io" target="_blank" rel="noreferrer" className="block text-brand-cyan text-sm hover:underline">fhenix.io</a>
        <a href="https://x.com/fhenix" target="_blank" rel="noreferrer" className="block text-brand-cyan text-sm hover:underline">X: @fhenix</a>
        <a href="https://x.com/ChrisGold__" target="_blank" rel="noreferrer" className="block text-brand-cyan text-sm hover:underline">X: @ChrisGold__ (Creator)</a>
        <a href="https://github.com/AshThunder/nixwallet" target="_blank" rel="noreferrer" className="block text-brand-cyan text-sm hover:underline">GitHub: AshThunder/nixwallet</a>
      </div>
    </div>
  );

  return (
    <div className="w-full min-h-screen overflow-hidden bg-app text-main font-sans relative flex flex-col">
      <div className="absolute top-[-100px] left-[-100px] w-64 h-64 bg-brand-cyan/10 mix-blend-screen filter blur-[100px]" />

      <header className="w-full p-6 flex items-center gap-4 relative z-10 border-b border-ui">
        <button 
          onClick={() => activeTab === 'menu' ? onBack() : setActiveTab('menu')} 
          className="text-sub hover:text-brand-cyan transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col">
          <h1 className="text-xl font-bold font-brand uppercase tracking-tighter">Settings</h1>
          {activeTab !== 'menu' && (
            <span className="text-[10px] text-brand-cyan tracking-widest uppercase font-mono">
              / {activeTab.replace(/([A-Z])/g, ' $1').trim()}
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 w-full p-6 relative z-10 overflow-y-auto no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'menu' && renderMainMenu()}
            {activeTab === 'security' && renderSecurity()}
            {activeTab === 'addressBook' && renderAddressBook()}
            {activeTab === 'networks' && renderNetworks()}
            {activeTab === 'about' && renderAbout()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
