import { useState, useEffect, useCallback } from 'react';
import { isVaultInitialized, unlockVault, createVault, cacheSession, getSessionCache, clearSessionCache } from './lib/vault';
import type { VaultData } from './lib/vault';
import { getActiveNetwork, setActiveNetwork, loadNetwork, getAccountByIndex, type NetworkId } from './lib/wallet';
import Onboarding from './screens/Onboarding';
import UnlockScreen from './screens/Unlock';
import Dashboard from './screens/Dashboard';
import WrapUnwrap from './screens/WrapUnwrap';
import SendScreen from './screens/Send';
import SettingsScreen from './screens/Settings';
import ManageTokens from './screens/ManageTokens';
import Receive from './screens/Receive';
import SwapScreen from './screens/Swap';
import DappsScreen from './screens/Dapps';

type Screen = 'loading' | 'onboarding' | 'unlock' | 'dashboard' | 'wrap' | 'send' | 'receive' | 'settings' | 'manage-tokens' | 'swap' | 'dapps';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [screen, setScreen] = useState<Screen>('loading');
  const [address, setAddress] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [accountIndex, setAccountIndex] = useState(0);
  const [importedAccounts, setImportedAccounts] = useState<{ address: string; privateKey: string; name?: string }[]>([]);
  const [network, setNetwork] = useState(getActiveNetwork());
  const [selectedToken, setSelectedToken] = useState<{
    symbol: string;
    address: string;
    decimals?: number;
  } | null>(null);

  const handleUnlock = useCallback(async (data: VaultData) => {
    let idx = 0;
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const res = await chrome.storage.local.get(['activeAccountIndex']);
      idx = res.activeAccountIndex !== undefined ? Number(res.activeAccountIndex) : 0;
    }
    
    setAccountIndex(idx);
    setMnemonic(data.mnemonic);
    setImportedAccounts(data.importedAccounts || []);
    
    let accountType = 'hd';
    let activeAddr: string | null = null;
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const res = await chrome.storage.local.get(['activeAccountType', 'activeAddress']);
      accountType = res.activeAccountType === 'imported' ? 'imported' : 'hd';
      activeAddr = typeof res.activeAddress === 'string' ? res.activeAddress : null;
    }

    if (accountType === 'imported' && activeAddr) {
      const acc = (data.importedAccounts || []).find(a => a.address.toLowerCase() === activeAddr!.toLowerCase());
      if (acc) {
        setAddress(acc.address);
        setPrivateKey(acc.privateKey);
      } else {
        const { address: addr, privateKey: pk } = getAccountByIndex(data.mnemonic, idx);
        setAddress(addr);
        setPrivateKey(pk);
      }
    } else {
      const { address: addr, privateKey: pk } = getAccountByIndex(data.mnemonic, idx);
      setAddress(addr);
      setPrivateKey(pk);
    }
    setScreen('dashboard');

    await cacheSession(data);
    chrome.runtime.sendMessage({ type: 'VAULT_UNLOCKED' }).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const initialized = await isVaultInitialized();
      await loadNetwork();
      
      const res = await chrome.storage.local.get(['theme']);
      if (res.theme === 'light' || res.theme === 'dark') setTheme(res.theme);
      
      setNetwork(getActiveNetwork());

      if (initialized) {
        const cached = await getSessionCache();
        if (cached) {
          await handleUnlock(cached);
          return;
        }
      }

      setScreen(initialized ? 'unlock' : 'onboarding');
    })();
  }, [handleUnlock]);

  useEffect(() => {
    const listener = (message: { type?: string }) => {
      if (message?.type === 'VAULT_LOCKED') {
        setPrivateKey('');
        setMnemonic('');
        clearSessionCache();
        setScreen('unlock');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    const resetTimer = () => {
      chrome.runtime.sendMessage({ type: 'KEEP_ALIVE' }).catch(() => {});
    };
    const events = ['click', 'keydown', 'scroll', 'input'] as const;
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    return () => { events.forEach(e => window.removeEventListener(e, resetTimer)); };
  }, []);

  useEffect(() => {
    document.documentElement.className = theme;
    chrome.storage.local.set({ theme });
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const handleOnboardingComplete = (addr: string) => {
    setAddress(addr);
    setScreen('unlock');
  };

  const handleAccountChange = (arg: number | string) => {
    if (typeof arg === 'number') {
      // HD Account
      if (!mnemonic) return;
      const { address: addr, privateKey: pk } = getAccountByIndex(mnemonic, arg);
      setAccountIndex(arg);
      setAddress(addr);
      setPrivateKey(pk);
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ activeAccountIndex: arg, activeAccountType: 'hd', activeAddress: addr });
      }
    } else {
      // Imported Account (arg is address)
      const acc = importedAccounts.find(a => a.address.toLowerCase() === arg.toLowerCase());
      if (acc) {
        setAddress(acc.address);
        setPrivateKey(acc.privateKey);
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.set({ activeAccountType: 'imported', activeAddress: acc.address });
        }
      }
    }
  };

  const handleImportAccount = async (acc: { address: string; privateKey: string; name?: string }, pass: string): Promise<boolean> => {
    try {
      // 1. Decrypt existing vault to get all current data
      const data = await unlockVault(pass);
      if (!data) return false;
      
      // 2. Add new account
      const updatedImported = [...(data.importedAccounts || []), acc];
      const updatedData: VaultData = {
        ...data,
        importedAccounts: updatedImported
      };
      
      // 3. Re-save vault
      await createVault(updatedData, pass);
      
      // 4. Update memory state
      setImportedAccounts(updatedImported);
      setAddress(acc.address);
      setPrivateKey(acc.privateKey);
      
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ activeAccountType: 'imported', activeAddress: acc.address });
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleLock = async () => {
    setPrivateKey('');
    setMnemonic('');
    await clearSessionCache();
    chrome.runtime.sendMessage({ type: 'VAULT_LOCKED' }).catch(() => {});
    setScreen('unlock');
  };

  const handleReset = () => {
    setAddress('');
    setPrivateKey('');
    setMnemonic('');
    setScreen('onboarding');
  };

  const handleNetworkChange = (id: string) => {
    setActiveNetwork(id as NetworkId);
    setNetwork(getActiveNetwork());
    // Force re-render
    setScreen('dashboard');
  };

  if (screen === 'loading') {
    return (
      <div className="w-full min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (screen === 'onboarding') {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (screen === 'unlock') {
    return <UnlockScreen onUnlock={handleUnlock} />;
  }

  if (screen === 'wrap') {
    return <WrapUnwrap address={address} privateKey={privateKey} initialToken={selectedToken} onBack={() => setScreen('dashboard')} />;
  }

  if (screen === 'send') {
    return <SendScreen address={address} privateKey={privateKey} initialToken={selectedToken} onBack={() => setScreen('dashboard')} />;
  }

  if (screen === 'receive') {
    return <Receive address={address} onBack={() => setScreen('dashboard')} />;
  }

  if (screen === 'swap') {
    return <SwapScreen onBack={() => setScreen('dashboard')} />;
  }

  if (screen === 'dapps') {
    return <DappsScreen onBack={() => setScreen('settings')} />;
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        address={address}
        mnemonic={mnemonic}
        onBack={() => setScreen('dashboard')}
        onReset={handleReset}
        onNetworkChange={handleNetworkChange}
        onNavigate={(s) => setScreen(s as Screen)}
      />
    );
  }

  if (screen === 'manage-tokens') {
    return (
      <ManageTokens
        network={network}
        walletAddress={address}
        onBack={() => setScreen('dashboard')}
      />
    );
  }

  return (
    <Dashboard
      address={address}
      privateKey={privateKey}
      mnemonic={mnemonic}
      accountIndex={accountIndex}
      importedAccounts={importedAccounts}
      network={network}
      theme={theme}
      onToggleTheme={toggleTheme}
      onNavigate={(s, tokenData) => {
        if (tokenData) setSelectedToken(tokenData);
        else setSelectedToken(null);
        setScreen(s as Screen);
      }}
      onAccountChange={handleAccountChange}
      onImportAccount={handleImportAccount}
      onLock={handleLock}
    />
  );
}

export default App;
