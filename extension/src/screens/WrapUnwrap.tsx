import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2, CheckCircle, AlertCircle, ChevronDown, Eye, Lock, ExternalLink } from 'lucide-react';
import { getSigner, getActiveNetwork, getProvider } from '../lib/wallet';
import { CONTRACTS } from '../lib/contracts';
import { initCofheClient, encryptAmount, decryptForTransaction, decryptForView } from '../lib/cofhe';
import { addActivity } from '../lib/activity';
import { ethers } from 'ethers';

interface Props {
  address: string;
  privateKey: string;
  initialToken?: { symbol: string; address: string; decimals?: number } | null;
  onBack: () => void;
}

type Mode = 'wrap' | 'unwrap';
type Status = 'idle' | 'loading' | 'success' | 'error';

export default function WrapUnwrap({ address: _address, privateKey, initialToken, onBack }: Props) {
  const [mode, setMode] = useState<Mode>('wrap');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [tokens, setTokens] = useState<any[]>([]);
  const [selectedToken, setSelectedToken] = useState<any | null>(null);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [publicBalance, setPublicBalance] = useState<string | null>(null);
  const [privateBalance, setPrivateBalance] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [hashes, setHashes] = useState<{ approve?: string; action?: string }>({});

  useEffect(() => {
    const loadTokens = async () => {
      const network = getActiveNetwork();
      const key = `custom_tokens_${network.id}`;
      const res = await chrome.storage.local.get([key]);
      const customs = (res[key] || []) as any[];

      // MOCK is our absolute default
      const all = [
        { symbol: 'MOCK', address: CONTRACTS.underlying },
        ...customs
      ];

      setTokens(all);
      // Pre-select the initial token if provided
      if (initialToken) {
        const match = all.find((t: any) => t.address.toLowerCase() === initialToken.address.toLowerCase());
        if (match) setSelectedToken(match);
        else setSelectedToken(all[0]);
      } else if (all.length > 0) {
        setSelectedToken(all[0]);
      }
    };
    loadTokens();
  }, []);

  const fetchBal = async () => {
    if (!selectedToken) return;
    try {
      const provider = getProvider();
      const decimals = selectedToken.decimals || 18;
      const erc20 = new ethers.Contract(selectedToken.address, ['function balanceOf(address) view returns (uint256)'], provider);
      const bal = await erc20.balanceOf(_address);
      setPublicBalance(ethers.formatUnits(bal, decimals));
    } catch { setPublicBalance('0.00'); }
  };

  useEffect(() => {
    fetchBal();
    setPrivateBalance(null); // reset private when token changes
  }, [selectedToken, _address]);

  const handleDecryptBalance = async () => {
    if (!selectedToken) return;
    setIsDecrypting(true);
    try {
      await initCofheClient(privateKey);
      const provider = getProvider();
      const signer = new ethers.Wallet(privateKey, provider);
      const wrapper = new ethers.Contract(CONTRACTS.wrapper, ['function getBalance(address) external view returns (bytes32)'], signer);
      const ctHash = await wrapper.getBalance(selectedToken.address);
      if (ctHash === '0x' + '0'.repeat(64)) {
        setPrivateBalance('0.00');
      } else {
        const network = getActiveNetwork();
        const decryptedWei = await decryptForView(ctHash, network.chainId, _address);
        setPrivateBalance(ethers.formatUnits(decryptedWei, selectedToken.decimals || 18));
      }
    } catch (e: any) {
      console.error('Decrypt error:', e);
      setPrivateBalance('Error');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleWrap = async () => {
    if (!selectedToken) throw new Error('No token selected');
    const signer = getSigner(privateKey);
    const decimals = selectedToken.decimals || 18;
    const parsedAmount = ethers.parseUnits(amount, decimals);
    if (parsedAmount === 0n) throw new Error('Amount must be > 0');

    setHashes({});
    setStatusMsg(`Approving ${selectedToken.symbol} tokens...`);
    const underlying = new ethers.Contract(
      selectedToken.address,
      ['function approve(address spender, uint256 amount) external returns (bool)'],
      signer
    );
    const approveTx = await underlying.approve(CONTRACTS.wrapper, parsedAmount);
    setHashes({ approve: approveTx.hash });
    await approveTx.wait();

    setStatusMsg(`Wrapping into Confidential Vault...`);
    const wrapper = new ethers.Contract(CONTRACTS.wrapper, ['function wrap(address token, uint128 amount) external'], signer);
    const wrapTx = await wrapper.wrap(selectedToken.address, parsedAmount);
    setHashes(prev => ({ ...prev, action: wrapTx.hash }));

    const network = getActiveNetwork();
    await addActivity({
      id: wrapTx.hash,
      type: 'wrap',
      amount: `${amount} ${selectedToken.symbol}`,
      status: 'pending',
      networkId: network.id,
      address: _address,
      hash: wrapTx.hash,
      isConfidential: true,
    });

    await wrapTx.wait();
    await addActivity({
      id: wrapTx.hash,
      type: 'wrap',
      amount: `${amount} c${selectedToken.symbol}`,
      status: 'success',
      networkId: network.id,
      address: _address,
      isConfidential: true,
    });
  };

  const handleUnwrap = async () => {
    if (!selectedToken) throw new Error('No token selected');
    const signer = getSigner(privateKey);
    const wrapper = new ethers.Contract(CONTRACTS.wrapper, [
      'function requestUnwrap(address token, tuple(uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature) encryptedAmount) external',
      'function getPendingUnwrap(address token) external view returns (bytes32)',
    ], signer);

    setStatusMsg('Checking for pending requests...');
    setHashes({});
    const existingCtHash = await wrapper.getPendingUnwrap(selectedToken.address);
    const hasPending = existingCtHash !== '0x' + '0'.repeat(64);

    if (hasPending) {
      await handleFinalize(existingCtHash, true, selectedToken.address);
    } else {
      const decimals = selectedToken.decimals || 18;
      const parsedAmount = ethers.parseUnits(amount, decimals);
      if (parsedAmount === 0n) throw new Error('Amount must be > 0');

      setStatusMsg('Step 1/4: Init FHE...');
      await initCofheClient(privateKey);

      setStatusMsg('Step 2/4: Encrypting...');
      const encrypted = await encryptAmount(parsedAmount);

      setStatusMsg('Step 3/4: Submitting...');
      const reqTx = await wrapper.requestUnwrap(selectedToken.address, {
        ctHash: encrypted.ctHash,
        securityZone: encrypted.securityZone ?? 0,
        utype: encrypted.utype,
        signature: encrypted.signature,
      });
      setHashes({ action: reqTx.hash });
      
      const network = getActiveNetwork();
      await addActivity({
        id: reqTx.hash,
        type: 'unwrap',
        amount: `${amount} c${selectedToken.symbol}`,
        status: 'pending',
        networkId: network.id,
        address: _address,
        isConfidential: true,
      });

      await reqTx.wait();
      const pendingCtHash = await wrapper.getPendingUnwrap(selectedToken.address);
      await handleFinalize(pendingCtHash, false, selectedToken.address);
    }
  };

  const handleFinalize = async (pendingCtHash: string, hasPending: boolean, tokenAddress: string) => {
    setStatus('loading');
    setStatusMsg('Finalizing through Threshold...');

    try {
      if (hasPending) await initCofheClient(privateKey);
      
      let decryptedValue: bigint;
      let signature: string;
      
      setStatusMsg('Syncing w/ Threshold Node...');
      let attempts = 0;
      const maxAttempts = 15; // Provide up to 60 seconds for oracle indexing
      while (true) {
        try {
          const res = await decryptForTransaction(pendingCtHash, 11155111, _address);
          decryptedValue = res.decryptedValue;
          signature = res.signature;
          break;
        } catch (err: any) {
          attempts++;
          if (err?.message?.includes('404') && attempts < maxAttempts) {
            setStatusMsg(`Syncing w/ Threshold Node (${attempts}/${maxAttempts})...`);
            await new Promise(r => setTimeout(r, 4000)); // 4s delay
            continue;
          }
          throw err;
        }
      }
      
      setStatusMsg('Finalizing Unwrap...');

      const signer = getSigner(privateKey);
      const wrapper = new ethers.Contract(CONTRACTS.wrapper, ['function finalizeUnwrap(address,bytes32,uint256,bytes) external'], signer);
      const finTx = await wrapper.finalizeUnwrap(tokenAddress, pendingCtHash, decryptedValue, signature);
      setHashes(prev => ({ ...prev, approve: prev.action, action: finTx.hash })); // move request to approve slot
      
      const network = getActiveNetwork();
      const decimals = selectedToken?.decimals || 18;
      await addActivity({
        id: finTx.hash,
        type: 'unwrap',
        amount: `${ethers.formatUnits(decryptedValue, decimals)} ${network.symbol}`,
        status: 'pending',
        networkId: network.id,
        address: _address,
        hash: finTx.hash,
        isConfidential: true,
      });

      await finTx.wait();
      await addActivity({
        id: finTx.hash,
        type: 'unwrap',
        amount: `${ethers.formatUnits(decryptedValue, decimals)} ${network.symbol}`,
        status: 'success',
        networkId: network.id,
        address: _address,
        hash: finTx.hash,
        isConfidential: true,
      });

      setStatus('success');
      setStatusMsg('Unwrap Finalized');
      fetchBal();
      if (privateBalance) handleDecryptBalance();
    } catch (e: any) {
      setStatus('error');
      setStatusMsg(String(e.message).slice(0, 80));
    }
  };

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setStatus('loading');
    try {
      if (mode === 'wrap') {
        await handleWrap();
        setStatus('success');
        setStatusMsg('Wrapped Successfully');
        fetchBal();
        if (privateBalance) handleDecryptBalance();
      } else {
        await handleUnwrap();
      }
    } catch (e: any) {
      setStatus('error');
      setStatusMsg(String(e.message).slice(0, 80));
    }
  };

  return (
    <div className="w-[360px] h-[600px] overflow-hidden bg-app text-main font-sans relative flex flex-col">
      <div className="absolute top-[-100px] left-[-100px] w-64 h-64 bg-brand-cyan/10 mix-blend-screen filter blur-[100px]" />

      <header className="w-full p-6 flex items-center gap-4 relative z-10 border-b border-ui">
        <button onClick={onBack} className="text-sub hover:text-brand-cyan transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold font-brand uppercase tracking-tighter">Wrap / Unwrap</h1>
      </header>

      <main className="flex-1 w-full px-6 pt-6 relative z-10 overflow-y-auto no-scrollbar pb-4">
        {/* Mode Toggle */}
        <div className="flex bg-surface p-1 mb-8">
          {(['wrap', 'unwrap'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setStatus('idle'); setStatusMsg(''); }}
              className={`flex-1 py-3 text-label-caps transition-all ${
                mode === m
                  ? 'bg-brand-cyan text-brand-midnight font-bold'
                  : 'text-sub hover:text-main'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-8">
          {/* Token Details */}
          {selectedToken && (
            <div className="p-4 bg-surface border border-ui space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center border border-ui text-main font-bold text-lg bg-app shrink-0">
                  {selectedToken.symbol[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-brand font-bold text-lg tracking-tight">{selectedToken.symbol}</div>
                  <div className="text-[10px] font-mono text-muted truncate">{selectedToken.address.slice(0,6)}...{selectedToken.address.slice(-4)}</div>
                </div>
              </div>

              {/* Balance display */}
              <div className="flex items-center justify-between pt-3 border-t border-ui">
                {mode === 'wrap' ? (
                  <>
                    <div className="text-[10px] font-bold text-muted uppercase tracking-widest">Available Balance</div>
                    <div className="font-brand font-bold text-lg tracking-tight text-main">
                      {publicBalance !== null ? publicBalance : <Loader2 className="w-4 h-4 animate-spin text-muted inline" />}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] font-bold text-muted uppercase tracking-widest flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-brand-cyan" /> Private Balance
                    </div>
                    {privateBalance !== null ? (
                      <div className="font-brand font-bold text-lg tracking-tight text-brand-cyan">
                        {privateBalance}
                      </div>
                    ) : (
                      <button
                        onClick={handleDecryptBalance}
                        disabled={isDecrypting}
                        className="flex items-center gap-2 text-[10px] font-bold text-brand-cyan hover:text-brand-cyan/80 uppercase tracking-widest transition-colors"
                      >
                        {isDecrypting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                        {isDecrypting ? 'Decrypting...' : 'Decrypt'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-label-caps text-muted px-1">Transfer Type</div>
            <div className="flex items-center gap-4 bg-input-field p-4 border border-ui relative">
               <div className="flex-1 text-center py-2 bg-app text-label-caps text-[10px] text-sub">
                {mode === 'wrap' ? 'Public Balance' : 'Private Balance'}
              </div>
              <ArrowRight className="w-4 h-4 text-brand-cyan shrink-0" />
               <div className="flex-1 text-center py-2 bg-app text-label-caps text-[10px] text-sub">
                {mode === 'wrap' ? 'Private Balance' : 'Public Balance'}
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-3">
            <label className="text-label-caps text-sub px-1">Amount</label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface border-l-2 border-brand-cyan p-4 text-3xl font-brand font-bold tracking-tighter placeholder:text-muted focus:outline-none focus:bg-input-field transition-all pr-20"
              />
              <button
                onClick={() => setShowTokenDropdown(!showTokenDropdown)}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-ui px-3 py-1.5 text-label-caps text-main hover:bg-brand-cyan hover:text-brand-midnight transition-colors"
                disabled={status === 'loading'}
              >
                {selectedToken ? (mode === 'wrap' ? selectedToken.symbol : `c${selectedToken.symbol}`) : 'SELECT'}
                <ChevronDown className="w-3 h-3" />
              </button>
              
              <AnimatePresence>
                {showTokenDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-surface border border-ui shadow-card z-50 flex flex-col"
                  >
                    {tokens.map(t => (
                      <button
                        key={t.address}
                        onClick={() => { setSelectedToken(t); setShowTokenDropdown(false); }}
                        className="px-4 py-3 text-left hover:bg-input-field text-sm font-bold font-brand transition-colors border-b border-ui last:border-b-0"
                      >
                        {mode === 'wrap' ? t.symbol : `c${t.symbol}`}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {mode === 'unwrap' && (
              <div className="text-[9px] text-muted font-mono leading-relaxed uppercase opacity-60 px-1">
                Sequence: Init ➔ Encrypt ➔ Request ➔ Finish
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Status + Button pinned to bottom */}
      <div className="w-full px-6 pb-6 pt-3 relative z-10 shrink-0 border-t border-ui bg-app">
        <AnimatePresence>
          {status !== 'idle' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`mb-3 p-3 border-l-4 text-[12px] font-bold uppercase tracking-widest ${
                status === 'loading' ? 'bg-brand-cyan/5 border-brand-cyan text-main' :
                status === 'success' ? 'bg-brand-cyan/10 border-brand-cyan text-main' :
                'bg-red-500/5 border-red-500 text-red-600'
              }`}
            >
              <div className="flex items-center gap-3">
                {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
                {status === 'success' && <CheckCircle className="w-4 h-4" />}
                {status === 'error' && <AlertCircle className="w-4 h-4" />}
                <span>{statusMsg}</span>
              </div>

              {(hashes.approve || hashes.action) && (
                <div className="mt-3 space-y-2 pt-3 border-t border-brand-cyan/10">
                  {hashes.approve && (
                    <a 
                      href={`${getActiveNetwork().explorer}/tx/${hashes.approve}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between text-[11px] font-mono text-main hover:text-brand-cyan transition-colors group"
                    >
                      <span className="font-bold uppercase tracking-widest text-brand-cyan">Step 1: Hash</span>
                      <div className="flex items-center gap-1.5 bg-brand-cyan/10 px-2 py-0.5 border border-brand-cyan/20 group-hover:bg-brand-cyan/30">
                        {hashes.approve.slice(0, 10)}...{hashes.approve.slice(-8)}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </div>
                    </a>
                  )}
                  {hashes.action && (
                    <a 
                      href={`${getActiveNetwork().explorer}/tx/${hashes.action}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between text-[11px] font-mono text-main hover:text-brand-cyan transition-colors group"
                    >
                      <span className="font-bold uppercase tracking-widest text-brand-cyan">Step 2: Hash</span>
                      <div className="flex items-center gap-1.5 bg-brand-cyan/10 px-2 py-0.5 border border-brand-cyan/20 group-hover:bg-brand-cyan/30">
                        {hashes.action.slice(0, 10)}...{hashes.action.slice(-8)}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </div>
                    </a>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={handleSubmit}
          disabled={!amount || parseFloat(amount) <= 0 || status === 'loading'}
          className="w-full bg-brand-cyan text-brand-midnight py-5 text-label-caps font-bold shadow-[0_0_30px_rgba(10,217,220,0.1)] disabled:opacity-20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
        >
          {status === 'loading' ? 'Processing...' : `Start ${mode === 'wrap' ? 'Wrap' : 'Unwrap'}`}
        </button>
      </div>
    </div>
  );
}
