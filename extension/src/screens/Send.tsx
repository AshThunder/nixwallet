import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowUpRight, Loader2, CheckCircle, AlertCircle, Lock, Shield, ChevronDown, Check, Eye, ExternalLink } from 'lucide-react';
import { CONTRACTS } from '../lib/contracts';
import { initCofheClient, encryptAmount, decryptForView } from '../lib/cofhe';
import { addActivity } from '../lib/activity';
import { getActiveNetwork, getSigner, shortenAddress } from '../lib/wallet';
import { getContacts, saveContact, type Contact } from '../lib/contacts';
import { ethers } from 'ethers';

interface Props {
  address: string;
  privateKey: string;
  initialToken?: { symbol: string; address: string; decimals?: number } | null;
  onBack: () => void;
}

type SendMode = 'public' | 'private';
type Status = 'idle' | 'loading' | 'success' | 'error';

export default function SendScreen({ address: _addr, privateKey, initialToken, onBack }: Props) {
  const [sendMode, setSendMode] = useState<SendMode>('public');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [saveContactToggled, setSaveContactToggled] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showContacts, setShowContacts] = useState(false);
  const [publicBalance, setPublicBalance] = useState('0.00');
  const [privateBalance, setPrivateBalance] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  // Token info
  const tokenSymbol = initialToken?.symbol || 'MOCK';
  const tokenAddress = initialToken?.address || CONTRACTS.underlying;

  const fetchBalances = async () => {
    try {
      const provider = new ethers.JsonRpcProvider(getActiveNetwork().rpc);
      if (tokenAddress === ethers.ZeroAddress) {
        const bal = await provider.getBalance(_addr);
        setPublicBalance(ethers.formatEther(bal));
      } else {
        const contract = new ethers.Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)'], provider);
        const bal = await contract.balanceOf(_addr);
        setPublicBalance(ethers.formatUnits(bal, initialToken?.decimals || 18));
      }

      setPrivateBalance(prev => prev || '***');
    } catch (e) {
      console.error('Fetch Balances Error:', e);
    }
  };

  const handleReveal = async () => {
    setDecrypting(true);
    try {
      await initCofheClient(privateKey);
      const network = getActiveNetwork();
      const signer = getSigner(privateKey);
      const wrapper = new ethers.Contract(
        CONTRACTS.wrapper,
        ['function getBalance(address) external view returns (bytes32)'],
        signer
      );

      const ctHash: string = await wrapper.getBalance(tokenAddress);
      if (ctHash === '0x' + '0'.repeat(64)) {
        setPrivateBalance('0.00');
      } else {
        const decryptedWei = await decryptForView(ctHash, network.chainId, _addr);
        setPrivateBalance(ethers.formatUnits(decryptedWei, initialToken?.decimals || 18));
      }
    } catch (e) {
      console.error('Reveal Error:', e);
    } finally {
      setDecrypting(false);
    }
  };

  useEffect(() => {
    getContacts().then(setContacts);
    fetchBalances();
  }, [tokenAddress]);

  const isValidAddress = recipient.startsWith('0x') && recipient.length === 42;

  const handleSend = async () => {
    if (!isValidAddress || !amount || parseFloat(amount) <= 0) return;

    setStatus('loading');
    setTxHash(null);
    const network = getActiveNetwork();

    try {
      const signer = getSigner(privateKey);

      if (saveContactToggled) {
        await saveContact({ address: recipient, name: `Node ${recipient.slice(2, 6)}` });
      }

      if (sendMode === 'public') {
        // Standard ERC-20 transfer
        setStatusMsg(`Sending ${tokenSymbol}...`);
        const erc20 = new ethers.Contract(
          tokenAddress,
          ['function transfer(address to, uint256 amount) external returns (bool)'],
          signer
        );
        const decimals = initialToken?.decimals || 18;
        const tx = await erc20.transfer(recipient, ethers.parseUnits(amount, decimals));
        setTxHash(tx.hash);

        await addActivity({
          id: tx.hash,
          type: 'send',
          amount: `${amount} ${tokenSymbol}`,
          status: 'pending',
          networkId: network.id,
          address: _addr,
          hash: tx.hash,
          isConfidential: false,
          recipient,
        });

        await tx.wait();
        await addActivity({
          id: tx.hash,
          type: 'send',
          amount: `${amount} ${tokenSymbol}`,
          status: 'success',
          networkId: network.id,
          address: _addr,
          hash: tx.hash,
          isConfidential: false,
          recipient,
        });
      } else {
        // Encrypted FHE transfer
        setStatusMsg('Initializing FHE client...');
        await initCofheClient(privateKey);

        setStatusMsg('Encrypting transfer amount...');
        const decimals = initialToken?.decimals || 18;
        const encrypted = await encryptAmount(ethers.parseUnits(amount, decimals));

        setStatusMsg('Submitting confidential transfer...');
        const wrapper = new ethers.Contract(
          CONTRACTS.wrapper,
          ['function transferEncrypted(address token, address to, tuple(uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature) encryptedAmount) external'],
          signer
        );

        const tx = await wrapper.transferEncrypted(tokenAddress, recipient, {
          ctHash: encrypted.ctHash,
          securityZone: encrypted.securityZone ?? 0,
          utype: encrypted.utype,
          signature: encrypted.signature,
        });
        setTxHash(tx.hash);

        await addActivity({
          id: tx.hash,
          type: 'confidential-transfer',
          amount: `${amount} c${tokenSymbol}`,
          status: 'pending',
          networkId: network.id,
          address: _addr,
          hash: tx.hash,
          isConfidential: true,
          recipient,
        });

        await tx.wait();
        await addActivity({
          id: tx.hash,
          type: 'confidential-transfer',
          amount: `${amount} c${tokenSymbol}`,
          status: 'success',
          networkId: network.id,
          address: _addr,
          hash: tx.hash,
          isConfidential: true,
          recipient,
        });
      }

      setStatus('success');
      setStatusMsg(sendMode === 'private' ? 'Confidential transfer complete!' : 'Transfer complete!');
      setAmount('');
      setRecipient('');
    } catch (e: any) {
      setStatus('error');
      setStatusMsg(e.message || 'Transaction failed');
    }
  };

  return (
    <div className="w-[360px] h-[600px] overflow-hidden bg-app text-main font-sans relative flex flex-col">
      <div className="absolute top-[-100px] left-[-100px] w-64 h-64 bg-brand-cyan/10 mix-blend-screen filter blur-[100px]" />

      <header className="w-full p-6 flex items-center gap-4 relative z-10 border-b border-ui">
        <button onClick={onBack} className="text-sub hover:text-brand-cyan transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold font-brand uppercase tracking-tighter">Send {tokenSymbol}</h1>
        </div>
      </header>

      <main className="flex-1 w-full px-6 pt-6 relative z-10 overflow-y-auto no-scrollbar">
        {/* Public / Private Toggle */}
        <div className="flex bg-surface p-1 mb-6">
          <button
            onClick={() => { setSendMode('public'); setStatus('idle'); }}
            className={`flex-1 py-3 text-label-caps transition-all flex items-center justify-center gap-2 ${
              sendMode === 'public'
                ? 'bg-brand-cyan text-brand-midnight font-bold'
                : 'text-sub hover:text-main'
            }`}
          >
            Public
          </button>
          <button
            onClick={() => { setSendMode('private'); setStatus('idle'); }}
            className={`flex-1 py-3 text-label-caps transition-all flex items-center justify-center gap-2 ${
              sendMode === 'private'
                ? 'bg-brand-cyan text-brand-midnight font-bold'
                : 'text-sub hover:text-main'
            }`}
          >
            <Lock className="w-3 h-3" /> Private
          </button>
        </div>

        {/* Mode description */}
        {sendMode === 'private' && (
          <div className="flex items-center gap-2 mb-6 p-3 bg-brand-cyan/10 border-l-2 border-brand-cyan">
            <Shield className="w-4 h-4 text-brand-cyan shrink-0" />
            <span className="text-[9px] text-main uppercase tracking-widest font-bold leading-relaxed">
              Encrypted transfer — amount hidden on chain
            </span>
          </div>
        )}

        <div className="space-y-6">
          {/* Recipient Input */}
          <div className="space-y-3 relative">
            <div className="flex justify-between items-center px-1">
              <label className="text-label-caps text-sub">Recipient</label>
              {contacts.length > 0 && (
                <button 
                  onClick={() => setShowContacts(!showContacts)}
                  className="text-label-caps text-brand-cyan hover:text-brand-cyan/80 flex items-center gap-1 transition-colors"
                >
                  Contacts<ChevronDown className={`w-3 h-3 transition-transform ${showContacts ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
            
            <div className="relative">
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..."
                className="w-full bg-surface border-l-2 border-brand-cyan p-4 text-xs font-mono text-main focus:outline-none focus:bg-input-field transition-all placeholder:text-muted"
              />
              <AnimatePresence>
                {showContacts && contacts.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute z-50 top-full left-0 right-0 mt-1 bg-app border border-ui shadow-card max-h-40 overflow-y-auto no-scrollbar"
                  >
                    {contacts.map(c => (
                      <button
                        key={c.address}
                        onClick={() => {
                          setRecipient(c.address);
                          setShowContacts(false);
                        }}
                        className="w-full p-4 text-left hover:bg-input-field flex items-center justify-between border-b border-ui last:border-none group transition-colors"
                      >
                        <span className="text-label-caps text-muted group-hover:text-brand-cyan transition-colors">{c.name}</span>
                        <span className="text-[10px] text-sub font-mono">{shortenAddress(c.address)}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {isValidAddress && !contacts.find(c => c.address.toLowerCase() === recipient.toLowerCase()) && (
              <label className="flex items-center gap-2 mt-2 px-1 cursor-pointer group">
                <div 
                  onClick={() => setSaveContactToggled(!saveContactToggled)}
                  className={`w-3 h-3 border transition-colors flex items-center justify-center ${
                    saveContactToggled ? 'bg-brand-cyan border-brand-cyan' : 'bg-transparent border-ui group-hover:border-brand-cyan/50'
                  }`}
                >
                  {saveContactToggled && <Check className="w-2 h-2 text-brand-midnight" />}
                </div>
                <span className="text-[9px] font-bold text-label-caps text-sub group-hover:text-main">Save Contact</span>
              </label>
            )}
          </div>

          {/* Amount */}
          <div className="space-y-4">
            <div className="flex justify-between items-end px-1">
              <label className="text-label-caps text-sub">Amount</label>
              <div className="text-right">
                <div className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">
                  Balance: <span className="text-main">{sendMode === 'private' ? (privateBalance || '***') : publicBalance} {tokenSymbol}</span>
                </div>
                {sendMode === 'private' && privateBalance === '***' && (
                  <button 
                    onClick={handleReveal}
                    disabled={decrypting}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-brand-cyan uppercase tracking-widest hover:text-brand-cyan/80 transition-colors disabled:opacity-50"
                  >
                    {decrypting ? <Loader2 className="w-3 h-3 animate-spin shadow-cyan" /> : <Eye className="w-3 h-3" />} Reveal Balance
                  </button>
                )}
              </div>
            </div>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface border-l-2 border-brand-cyan p-4 text-3xl font-brand font-bold tracking-tighter placeholder:text-muted focus:outline-none focus:bg-input-field transition-all pr-24"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-label-caps text-brand-cyan/40">
                {sendMode === 'private' ? `c${tokenSymbol}` : tokenSymbol}
              </span>
            </div>
          </div>
        </div>

        {/* Status & Progress */}
        <AnimatePresence>
          {(status !== 'idle' || txHash) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-6 space-y-3"
            >
              {status !== 'idle' && (
                <div className={`p-4 border-l-4 text-[12px] font-bold uppercase tracking-widest ${
                  status === 'loading' ? 'bg-brand-cyan/5 border-brand-cyan text-main' :
                  status === 'success' ? 'bg-brand-cyan/10 border-brand-cyan text-main' :
                  'bg-red-500/5 border-red-500 text-red-600'
                }`}>
                  <div className="flex items-center gap-3">
                    {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
                    {status === 'success' && <CheckCircle className="w-4 h-4" />}
                    {status === 'error' && <AlertCircle className="w-4 h-4" />}
                    <span className="text-[11px]">{statusMsg}</span>
                  </div>
                </div>
              )}

              {txHash && (
                <div className="flex justify-between items-center bg-surface border border-brand-cyan/20 px-3 py-2">
                  <div className="text-[10px] font-bold text-sub uppercase">Transaction</div>
                  <a
                    href={`${getActiveNetwork().explorer}/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-[11px] font-bold text-brand-cyan hover:text-brand-cyan/80 transition-colors uppercase"
                  >
                    {txHash.slice(0, 6)}...{txHash.slice(-4)} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <div className="p-6 relative z-10">
        <button
          onClick={handleSend}
          disabled={!isValidAddress || !amount || parseFloat(amount) <= 0 || status === 'loading'}
          className="w-full bg-brand-cyan text-brand-midnight py-5 text-label-caps font-bold shadow-[0_0_30px_rgba(10,217,220,0.1)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
        >
          {status === 'loading' ? 'Sending...' : `Send ${sendMode === 'private' ? 'Private' : 'Public'}`} <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
