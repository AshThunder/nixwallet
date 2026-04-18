import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2, CheckCircle, AlertCircle, ChevronDown, Eye, Lock, ExternalLink } from 'lucide-react';
import { getSigner, getActiveNetwork, getProvider } from '../lib/wallet';
import { getWrapperAddress, getOrCreateWrapper, REGISTRY_ADDRESS, WRAPPER_ABI } from '../lib/contracts';
import { initCofheClient, decryptForTx, decryptForView, FheTypes } from '../lib/cofhe';
import { addActivity } from '../lib/activity';
import { getCustomTokens } from '../lib/tokens';
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
  const [tokens, setTokens] = useState<Array<{ symbol: string; address: string; decimals?: number }>>([]);
  const [selectedToken, setSelectedToken] = useState<{ symbol: string; address: string; decimals?: number } | null>(null);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [publicBalance, setPublicBalance] = useState<string | null>(null);
  const [privateBalance, setPrivateBalance] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [hashes, setHashes] = useState<{ approve?: string; action?: string }>({});
  const [wrapperReady, setWrapperReady] = useState<boolean | null>(null);
  const [pendingClaims, setPendingClaims] = useState<{ ctHash: string; claimed: boolean }[]>([]);
  const [batchClaimStatus, setBatchClaimStatus] = useState<string | null>(null);

  const registryConfigured = REGISTRY_ADDRESS !== ethers.ZeroAddress;

  useEffect(() => {
    (async () => {
      const network = getActiveNetwork();
      const customs = await getCustomTokens(network.id);
      setTokens(customs);

      if (initialToken) {
        const match = customs.find(t => t.address.toLowerCase() === initialToken.address.toLowerCase());
        setSelectedToken(match || initialToken);
      } else if (customs.length > 0) {
        setSelectedToken(customs[0]);
      }
    })();
  }, [initialToken]);

  // Check if a wrapper exists for selected token
  useEffect(() => {
    if (!selectedToken || !registryConfigured) { setWrapperReady(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const provider = getProvider();
        const addr = await getWrapperAddress(provider, selectedToken.address);
        if (!cancelled) setWrapperReady(addr !== null);
      } catch {
        if (!cancelled) setWrapperReady(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedToken, registryConfigured]);

  const checkPendingClaims = async () => {
    if (!selectedToken || !registryConfigured) { setPendingClaims([]); return; }
    try {
      const provider = getProvider();
      const wrapperAddr = await getWrapperAddress(provider, selectedToken.address);
      if (!wrapperAddr) { setPendingClaims([]); return; }
      const wrapper = new ethers.Contract(wrapperAddr, WRAPPER_ABI, provider);
      const claims = await wrapper.getUserClaims(_address);
      setPendingClaims(claims.filter((c: { claimed: boolean }) => !c.claimed));
    } catch {
      setPendingClaims([]);
    }
  };

  useEffect(() => {
    if (mode === 'unwrap') checkPendingClaims();
    else setPendingClaims([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkPendingClaims depends on selectedToken internally
  }, [mode, selectedToken, status]);

  const handleBatchClaim = async () => {
    if (!selectedToken || pendingClaims.length === 0) return;
    setStatus('loading');
    setBatchClaimStatus(null);

    try {
      await initCofheClient(privateKey);
      const network = getActiveNetwork();
      const signer = getSigner(privateKey);
      const provider = signer.provider!;
      const wrapperAddr = await getWrapperAddress(provider, selectedToken.address);
      if (!wrapperAddr) throw new Error('No wrapper found');

      const ids: string[] = [];
      const amounts: bigint[] = [];
      const proofs: string[] = [];

      for (let i = 0; i < pendingClaims.length; i++) {
        const claim = pendingClaims[i];
        setBatchClaimStatus(`Decrypting claim ${i + 1}/${pendingClaims.length}...`);

        let decryptedValue: bigint;
        let signature: string;
          let attempts = 0;
          const maxAttempts = 10;
          while (true) {
            try {
              const res = await decryptForTx(claim.ctHash, network.chainId, _address, 'withoutPermit');
              decryptedValue = res.decryptedValue;
              signature = res.signature;
              break;
            } catch (err: unknown) {
              attempts++;
              if (err instanceof Error && err.message.includes('404') && attempts < maxAttempts) {
              await new Promise(r => setTimeout(r, 3000));
              continue;
            }
            throw err;
          }
        }
        ids.push(claim.ctHash);
        amounts.push(decryptedValue);
        proofs.push(signature);
      }

      setBatchClaimStatus('Submitting batch claim...');
      const wrapper = new ethers.Contract(wrapperAddr, WRAPPER_ABI, signer);
      const tx = await wrapper.claimUnshieldedBatch(ids, amounts, proofs);
      setHashes({ action: tx.hash });

      const totalClaimed = amounts.reduce((s, v) => s + v, 0n);
      const display = ethers.formatUnits(totalClaimed, 6);
      await addActivity({
        id: tx.hash, type: 'unwrap', amount: `${display} ${selectedToken.symbol}`,
        status: 'pending', networkId: network.id, address: _address, hash: tx.hash, isConfidential: true,
      });

      await tx.wait();
      await addActivity({
        id: tx.hash, type: 'unwrap', amount: `${display} ${selectedToken.symbol}`,
        status: 'success', networkId: network.id, address: _address, hash: tx.hash, isConfidential: true,
      });

      setStatus('success');
      setStatusMsg(`Claimed ${pendingClaims.length} pending unshields`);
      setBatchClaimStatus(null);
      setPendingClaims([]);
      fetchBal();
      if (privateBalance) handleDecryptBalance();
    } catch (e: unknown) {
      setStatus('error');
      setStatusMsg(e instanceof Error ? e.message.slice(0, 80) : 'Batch claim failed');
      setBatchClaimStatus(null);
    }
  };

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
    setPrivateBalance(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchBal depends on selectedToken internally
  }, [selectedToken, _address]);

  const handleDecryptBalance = async () => {
    if (!selectedToken || !registryConfigured) return;
    setIsDecrypting(true);
    try {
      await initCofheClient(privateKey);
      const signer = getSigner(privateKey);
      const provider = signer.provider!;
      const wrapperAddr = await getWrapperAddress(provider, selectedToken.address);
      if (!wrapperAddr) { setPrivateBalance('0.00'); setIsDecrypting(false); return; }

      const wrapper = new ethers.Contract(wrapperAddr, ['function confidentialBalanceOf(address) external view returns (bytes32)'], signer);
      const ctHash = await wrapper.confidentialBalanceOf(_address);
      if (ctHash === '0x' + '0'.repeat(64)) {
        setPrivateBalance('0.00');
      } else {
        const network = getActiveNetwork();
        const decrypted = await decryptForView(ctHash, network.chainId, _address, FheTypes.Uint64);
        setPrivateBalance(ethers.formatUnits(decrypted, 6));
      }
    } catch {
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
    setStatusMsg('Resolving wrapper (deploying if first use)...');
    const wrapperAddress = await getOrCreateWrapper(signer, selectedToken.address);
    setWrapperReady(true);

    setStatusMsg(`Approving ${selectedToken.symbol} tokens...`);
    const underlying = new ethers.Contract(
      selectedToken.address,
      ['function approve(address spender, uint256 amount) external returns (bool)'],
      signer
    );
    const approveTx = await underlying.approve(wrapperAddress, parsedAmount);
    setHashes({ approve: approveTx.hash });
    await approveTx.wait();

    setStatusMsg('Shielding to FHERC20...');
    const wrapper = new ethers.Contract(wrapperAddress, ['function shield(address to, uint256 amount) external returns (bytes32)'], signer);
    const wrapTx = await wrapper.shield(_address, parsedAmount);
    setHashes(prev => ({ ...prev, action: wrapTx.hash }));

    const network = getActiveNetwork();
    await addActivity({
      id: wrapTx.hash, type: 'wrap', amount: `${amount} ${selectedToken.symbol}`,
      status: 'pending', networkId: network.id, address: _address, hash: wrapTx.hash, isConfidential: true,
    });

    await wrapTx.wait();
    await addActivity({
      id: wrapTx.hash, type: 'wrap', amount: `${amount} c${selectedToken.symbol}`,
      status: 'success', networkId: network.id, address: _address, hash: wrapTx.hash, isConfidential: true,
    });
  };

  const handleUnwrap = async () => {
    if (!selectedToken) throw new Error('No token selected');
    const signer = getSigner(privateKey);
    const provider = signer.provider!;
    const wrapperAddr = await getWrapperAddress(provider, selectedToken.address);
    if (!wrapperAddr) throw new Error('No wrapper deployed for this token — shield some first');

    const wrapper = new ethers.Contract(wrapperAddr, [
      'function unshield(address from, address to, uint64 amount) external returns (bytes32)',
      'function getUserClaims(address user) external view returns ((address to, bytes32 ctHash, uint64 requestedAmount, uint64 decryptedAmount, bool claimed)[])',
    ], signer);

    setStatusMsg('Creating unshield request...');
    setHashes({});

    const parsedAmount = ethers.parseUnits(amount, 6);
    if (parsedAmount === 0n) throw new Error('Amount must be > 0');
    if (parsedAmount > BigInt('18446744073709551615')) throw new Error('Amount exceeds FHERC20 uint64 range');

    const reqTx = await wrapper.unshield(_address, _address, parsedAmount);
    setHashes({ action: reqTx.hash });

    const network = getActiveNetwork();
    await addActivity({
      id: reqTx.hash, type: 'unwrap', amount: `${amount} c${selectedToken.symbol}`,
      status: 'pending', networkId: network.id, address: _address, isConfidential: true,
    });

    await reqTx.wait();
    const claims = await wrapper.getUserClaims(_address);
    const pending = claims.filter((c: { claimed: boolean }) => !c.claimed);
    const latest = pending[pending.length - 1];
    if (!latest) throw new Error('No pending claim found after unshield');
    await handleFinalize(latest.ctHash, wrapperAddr, selectedToken);
  };

  const handleFinalize = async (
    pendingCtHash: string,
    wrapperAddr: string,
    token: { symbol: string; address: string; decimals?: number }
  ) => {
    setStatus('loading');
    setStatusMsg('Finalizing through Threshold...');

    try {
      await initCofheClient(privateKey);

      let decryptedValue: bigint;
      let signature: string;

      setStatusMsg('Syncing w/ Threshold Node...');
      let attempts = 0;
      const maxAttempts = 15;
      while (true) {
        try {
          const network = getActiveNetwork();
          const res = await decryptForTx(pendingCtHash, network.chainId, _address, 'withoutPermit');
          decryptedValue = res.decryptedValue;
          signature = res.signature;
          break;
        } catch (err: unknown) {
          attempts++;
          if (err instanceof Error && err.message.includes('404') && attempts < maxAttempts) {
            setStatusMsg(`Syncing w/ Threshold Node (${attempts}/${maxAttempts})...`);
            await new Promise(r => setTimeout(r, 4000));
            continue;
          }
          throw err;
        }
      }

      setStatusMsg('Claiming unshielded tokens...');

      const signer = getSigner(privateKey);
      const wrapper = new ethers.Contract(
        wrapperAddr,
        ['function claimUnshielded(bytes32,uint64,bytes) external'],
        signer
      );
      const finTx = await wrapper.claimUnshielded(pendingCtHash, decryptedValue, signature);
      setHashes(prev => ({ ...prev, approve: prev.action, action: finTx.hash }));

      const network = getActiveNetwork();
      const claimedDisplay = ethers.formatUnits(decryptedValue, 6);
      await addActivity({
        id: finTx.hash, type: 'unwrap', amount: `${claimedDisplay} ${token.symbol}`,
        status: 'pending', networkId: network.id, address: _address, hash: finTx.hash, isConfidential: true,
      });

      await finTx.wait();
      await addActivity({
        id: finTx.hash, type: 'unwrap', amount: `${claimedDisplay} ${token.symbol}`,
        status: 'success', networkId: network.id, address: _address, hash: finTx.hash, isConfidential: true,
      });

      setStatus('success');
      setStatusMsg('Unshield Claimed');
      fetchBal();
      if (privateBalance) handleDecryptBalance();
    } catch (e: unknown) {
      setStatus('error');
      setStatusMsg(e instanceof Error ? e.message.slice(0, 80) : 'Finalize failed');
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
    } catch (e: unknown) {
      setStatus('error');
      setStatusMsg(e instanceof Error ? e.message.slice(0, 80) : 'Operation failed');
    }
  };

  const handleSuccessDoAgain = () => {
    setStatus('idle');
    setStatusMsg('');
    setHashes({});
    setBatchClaimStatus(null);
    setAmount('');
  };

  return (
    <div className="w-full min-h-screen overflow-hidden bg-app text-main font-sans relative flex flex-col">
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
          {!registryConfigured && (
            <div className="p-3 border-l-4 border-red-500 bg-red-500/5 text-[10px] font-bold uppercase tracking-widest text-red-500">
              Registry not configured — deploy FHERC20WrapperRegistry and update the extension.
            </div>
          )}

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
                {wrapperReady !== null && (
                  <div className={`text-[9px] font-bold uppercase tracking-widest ${wrapperReady ? 'text-brand-cyan' : 'text-yellow-500'}`}>
                    {wrapperReady ? 'Wrapper Ready' : 'Will Auto-Deploy'}
                  </div>
                )}
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
                        disabled={isDecrypting || !registryConfigured}
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
                Sequence: Unshield → DecryptForTx → Claim
              </div>
            )}
          </div>

          {mode === 'unwrap' && pendingClaims.length > 0 && status !== 'loading' && (
            <div className="p-4 bg-amber-500/5 border border-amber-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  {pendingClaims.length} Pending Claim{pendingClaims.length > 1 ? 's' : ''}
                </div>
                {batchClaimStatus && (
                  <div className="text-[9px] text-amber-400 font-mono">{batchClaimStatus}</div>
                )}
              </div>
              <button
                onClick={handleBatchClaim}
                className="w-full py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-label-caps font-bold transition-all border border-amber-500/20"
              >
                Claim All Pending
              </button>
            </div>
          )}
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

        {status === 'success' ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSuccessDoAgain}
              className="flex-1 bg-brand-cyan text-brand-midnight py-5 text-label-caps font-bold shadow-[0_0_30px_rgba(10,217,220,0.1)] transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              Do again
            </button>
            <button
              type="button"
              onClick={onBack}
              className="flex-1 border border-ui bg-transparent text-main py-5 text-label-caps font-bold hover:border-brand-cyan/40 hover:text-brand-cyan transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              Go back
            </button>
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!amount || parseFloat(amount) <= 0 || status === 'loading' || !registryConfigured}
            className="w-full bg-brand-cyan text-brand-midnight py-5 text-label-caps font-bold shadow-[0_0_30px_rgba(10,217,220,0.1)] disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted disabled:border disabled:border-ui disabled:shadow-none transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            {status === 'loading' ? 'Processing...' : `Start ${mode === 'wrap' ? 'Wrap' : 'Unwrap'}`}
          </button>
        )}
      </div>
    </div>
  );
}
