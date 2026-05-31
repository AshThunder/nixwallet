import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, Send } from 'lucide-react';
import { getActiveNetwork, formatUnitsDisplay, getSigner, FHENIX_NETWORKS } from '../lib/wallet';
import { NATIVE_TOKEN_METADATA, WRAPPER_ABI, getWrapperAddress } from '../lib/contracts';
import { getCustomTokens } from '../lib/tokens';
import { parseNixCommand, toNixBotTokens, type NixBotIntent } from '../lib/nixBotParser';
import { describeIntent, executeNixBotIntent, precheckPrivateSendBalance } from '../lib/nixBotExecutor';
import { getContacts, type Contact } from '../lib/contacts';
import { ethers } from 'ethers';

type ChatRole = 'user' | 'bot';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  status?: 'progress' | 'done' | 'error';
  txHash?: string;
}

interface HistoryItem {
  id: string;
  command: string;
  createdAt: number;
}

interface Props {
  address: string;
  privateKey: string;
  onBack: () => void;
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'bot',
  content:
    "Hi — I'm Nix Bot. Tell me what you'd like to do in plain language and I'll handle it here.\n\n" +
    'Try: send 10 usdc to 0x..., private send 5 cusdc to 0x..., wrap 0.3 eth, unwrap 2 cusdc, claim all usdc, or reveal private balance usdc.',
  status: 'done',
};

const HELP_TEXT =
  'Commands I understand:\n' +
  '• send <amount> <token> to <address>\n' +
  '• private send <amount> <token> to <address>\n' +
  '• wrap <amount> <token>\n' +
  '• unwrap <amount> <token>\n' +
  '• claim all [token]\n' +
  '• reveal private balance [token]';

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|yo|howdy)(\s|!|$)/.test(text);
}

function isHelp(text: string): boolean {
  return text === 'help' || text === '?' || text === 'commands';
}

function intentPreview(intent: NixBotIntent): string {
  switch (intent.action) {
    case 'send':
      return [
        'Transaction preview:',
        `Action: ${intent.mode === 'private' ? 'Private Send' : 'Send'}`,
        `Token: ${intent.mode === 'private' ? `c${intent.token?.symbol}` : intent.token?.symbol}`,
        `Amount: ${intent.amount}`,
        `To: ${intent.recipient}`,
      ].join('\n');
    case 'wrap':
      return [
        'Transaction preview:',
        'Action: Wrap',
        `Token: ${intent.token?.symbol}`,
        `Amount: ${intent.amount}`,
      ].join('\n');
    case 'unwrap':
      return [
        'Transaction preview:',
        'Action: Unwrap',
        `Token: c${intent.token?.symbol}`,
        `Amount: ${intent.amount}`,
      ].join('\n');
    case 'claimAll':
      return [
        'Transaction preview:',
        'Action: Claim All',
        `Token: ${intent.token?.symbol ?? 'Auto-detect pending claims'}`,
      ].join('\n');
    case 'revealBalance':
      return [
        'Read-only preview:',
        'Action: Reveal Private Balance',
        `Token: ${intent.token?.symbol ?? 'All tokens with confidential wrappers'}`,
      ].join('\n');
    default:
      return 'Transaction preview';
  }
}

function intentNeedsConfirmation(intent: NixBotIntent): boolean {
  return intent.action !== 'revealBalance' && intent.action !== 'checkBalance' && intent.action !== 'switchNetwork';
}

export default function NixBotScreen({ address, privateKey, onBack }: Props) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [busy, setBusy] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<NixBotIntent | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [customTokens, setCustomTokens] = useState<Awaited<ReturnType<typeof getCustomTokens>>>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void getCustomTokens(getActiveNetwork().id).then(setCustomTokens).catch(() => setCustomTokens([]));
    void getContacts().then(setContacts).catch(() => setContacts([]));
  }, []);

  const tokens = useMemo(() => toNixBotTokens(NATIVE_TOKEN_METADATA, customTokens), [customTokens]);

  useEffect(() => {
    // Proactive pending claims alert
    const checkClaims = async () => {
      try {
        const signer = getSigner(privateKey);
        const provider = signer.provider!;
        const allT = toNixBotTokens(NATIVE_TOKEN_METADATA, customTokens);
        
        for (const token of allT) {
          const wrapperAddr = await getWrapperAddress(provider, token.address);
          if (!wrapperAddr) continue;
          const wrapper = new ethers.Contract(wrapperAddr, WRAPPER_ABI, provider);
          const claims = await wrapper.getUserClaims(address);
          const pending = claims.filter((c: { claimed: boolean }) => !c.claimed);
          if (pending.length > 0) {
            appendBot(`🔔 Alert: You have ${pending.length} pending unshield claim(s) for ${token.symbol}. You can claim them instantly by asking me: "claim all ${token.symbol.toLowerCase()}".`);
            break;
          }
        }
      } catch {
        // quiet fail
      }
    };
    if (customTokens.length > 0) {
      void checkClaims();
    }
  }, [customTokens, address, privateKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const patchMessage = (id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const appendBot = (content: string, extra?: Partial<ChatMessage>) => {
    const msg: ChatMessage = { id: nextId(), role: 'bot', content, ...extra };
    setMessages((prev) => [...prev, msg]);
    return msg.id;
  };

  const statusBadge = (status?: ChatMessage['status']) => {
    if (!status) return null;
    const map = {
      progress: { label: 'In Progress', cls: 'border-amber-400 text-amber-400 bg-amber-400/15' },
      done: { label: 'Completed', cls: 'border-emerald-400 text-emerald-400 bg-emerald-400/15' },
      error: { label: 'Failed', cls: 'border-red-400 text-red-400 bg-red-400/15' },
    } as const;
    const meta = map[status];
    return (
      <span className={`inline-flex items-center border px-2 py-0.5 text-[9px] uppercase tracking-wider ${meta.cls}`}>
        {meta.label}
      </span>
    );
  };

  const executeIntent = async (intent: NixBotIntent, opts: { confirmed: boolean }) => {
    setBusy(true);
    setPendingIntent(null);
    setPendingPreview(null);
    const ackText = opts.confirmed
      ? `Confirmed. Executing now — ${describeIntent(intent)}.`
      : `On it — ${describeIntent(intent)}.`;
    const firstProgressText = intent.action === 'revealBalance'
      ? 'Preparing secure balance reveal...'
      : 'Preparing transaction...';
    const ackId = appendBot(ackText, { status: 'progress' });
    const progressId = appendBot(firstProgressText, { status: 'progress' });

    const reminderTimer = window.setTimeout(() => {
      patchMessage(progressId, {
        content: intent.action === 'revealBalance' || (intent.action === 'send' && intent.mode === 'private')
          ? 'Still working... waiting for threshold decryption response.'
          : intent.action === 'claimAll'
            ? 'Still working... decrypting pending claims.'
          : 'Still working... network may be congested. I will update as soon as it is confirmed.',
        status: 'progress',
      });
    }, 20000);

    const result = await executeNixBotIntent(
      intent,
      { address, privateKey, tokens },
      (status) => patchMessage(progressId, { content: status, status: 'progress' }),
    );

    window.clearTimeout(reminderTimer);
    patchMessage(ackId, { status: result.success ? 'done' : 'error' });
    patchMessage(progressId, {
      content: result.message,
      status: result.success ? 'done' : 'error',
      txHash: result.txHash,
    });
    if (intent.action === 'switchNetwork' && result.success) {
      void getCustomTokens(getActiveNetwork().id).then(setCustomTokens).catch(() => setCustomTokens([]));
    }
    setBusy(false);
    inputRef.current?.focus();
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (pendingIntent) {
      appendBot('Please confirm or cancel the pending transaction preview first.', { status: 'error' });
      return;
    }

    setInput('');
    setBusy(true);
    setHistory((prev) => [{ id: nextId(), command: text, createdAt: Date.now() }, ...prev].slice(0, 30));
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: text }]);

    const normalized = text.trim().toLowerCase();

    if (isHelp(normalized)) {
      appendBot(HELP_TEXT, { status: 'done' });
      setBusy(false);
      inputRef.current?.focus();
      return;
    }

    if (isGreeting(normalized)) {
      appendBot(
        "Hey! I'm here to send, wrap, unwrap, claim, or reveal your private balance. What would you like to do?",
        { status: 'done' },
      );
      setBusy(false);
      inputRef.current?.focus();
      return;
    }

    const intent = parseNixCommand(text, tokens, contacts);
    if (!intent) {
      appendBot('I did not catch that — try a command like send 1 usdc to 0x...', { status: 'error' });
      setBusy(false);
      inputRef.current?.focus();
      return;
    }

    if (intent.errors.length > 0) {
      appendBot(
        intent.errors.length === 1
          ? intent.errors[0]
          : `I couldn't quite parse that:\n${intent.errors.map((e) => `• ${e}`).join('\n')}`,
        { status: 'error' },
      );
      setBusy(false);
      inputRef.current?.focus();
      return;
    }

    let previewText = intentPreview(intent);
    if (intent.action === 'send' && intent.mode === 'private' && intent.token && intent.amount) {
      const checkId = appendBot(`Checking c${intent.token.symbol} balance...`, { status: 'progress' });
      try {
        const check = await precheckPrivateSendBalance(
          intent.token,
          intent.amount,
          address,
          privateKey,
        );
        if (!check.sufficient) {
          const availableDisplay = formatUnitsDisplay(check.available, 6);
          patchMessage(checkId, {
            status: 'error',
            content: `Insufficient private c${intent.token.symbol}. Available ${availableDisplay}, requested ${intent.amount}.`,
          });
          setBusy(false);
          inputRef.current?.focus();
          return;
        }
        const availableDisplay = formatUnitsDisplay(check.available, 6);
        patchMessage(checkId, {
          status: 'done',
          content: `c${intent.token.symbol} available: ${availableDisplay}`,
        });
        previewText = `${previewText}\nAvailable: ${availableDisplay} c${intent.token.symbol}`;
      } catch (e: unknown) {
        patchMessage(checkId, {
          status: 'error',
          content: e instanceof Error ? e.message : 'Failed to decrypt private balance.',
        });
        setBusy(false);
        inputRef.current?.focus();
        return;
      }
    }

    let estFeeStr = '';
    if (intentNeedsConfirmation(intent)) {
      const estId = appendBot('Estimating gas fee...', { status: 'progress' });
      try {
        const signer = getSigner(privateKey);
        const provider = signer.provider!;
        const feeData = await provider.getFeeData();
        const gasPrice = feeData?.gasPrice || ethers.parseUnits('0.1', 'gwei');

        let gasLimit = 150000n;
        if (intent.action === 'send') {
          if (intent.mode === 'private') {
            gasLimit = 220000n;
          } else if (intent.token?.isNative) {
            gasLimit = 21000n;
          } else {
            gasLimit = 65000n;
          }
        } else if (intent.action === 'wrap') {
          gasLimit = 160000n;
        } else if (intent.action === 'unwrap') {
          gasLimit = 240000n;
        } else if (intent.action === 'claimAll') {
          gasLimit = 150000n;
        }

        const totalFee = gasLimit * gasPrice;
        const activeNetwork = getActiveNetwork();
        estFeeStr = `\nGas Estimate: ~${ethers.formatEther(totalFee).slice(0, 8)} ${activeNetwork.symbol}`;
        patchMessage(estId, { status: 'done', content: `Gas estimation complete.${estFeeStr}` });
      } catch {
        estFeeStr = `\nGas Estimate: unknown`;
        patchMessage(estId, { status: 'done', content: `Gas estimation complete.` });
      }
    }

    const fullPreview = previewText + estFeeStr;
    appendBot(`I parsed this request.\n\n${fullPreview}`, { status: 'done' });
    if (intentNeedsConfirmation(intent)) {
      setPendingPreview(fullPreview);
      appendBot('Proceed?', { status: 'done' });
      setPendingIntent(intent);
      setBusy(false);
      inputRef.current?.focus();
      return;
    }

    await executeIntent(intent, { confirmed: false });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const explorerBase = getActiveNetwork().explorer;

  return (
    <div className="ui-density-comfortable w-full min-h-screen bg-app text-main font-sans flex flex-col">
      <header className="sticky top-0 z-10 w-full px-4 py-3 flex items-center gap-3 border-b border-ui bg-app/95 backdrop-blur shrink-0">
        <button type="button" onClick={onBack} className="text-sub hover:text-brand-cyan transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 bg-brand-cyan/15 flex items-center justify-center">
            <Bot className="w-4 h-4 text-brand-cyan" />
          </div>
          <div>
            <h1 className="text-base font-bold font-brand uppercase tracking-tighter leading-none">Nix Bot</h1>
            <p className="text-[10px] text-brand-cyan uppercase tracking-wider font-semibold">{getActiveNetwork().name}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="px-2.5 py-1 border border-ui text-[10px] font-bold uppercase tracking-wider text-sub hover:text-brand-cyan hover:border-brand-cyan transition-colors"
          >
            History
          </button>
          <button
            type="button"
            onClick={() => {
              setMessages([WELCOME]);
              setPendingIntent(null);
              setPendingPreview(null);
              setBusy(false);
            }}
            className="px-2.5 py-1 border border-ui text-[10px] font-bold uppercase tracking-wider text-sub hover:text-brand-cyan hover:border-brand-cyan transition-colors"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="px-2.5 py-1 border border-ui text-[10px] font-bold uppercase tracking-wider text-sub hover:text-brand-cyan hover:border-brand-cyan transition-colors"
          >
            Guide
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-2.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-brand-cyan text-brand-midnight rounded-tl-2xl rounded-tr-sm rounded-bl-2xl rounded-br-2xl'
                  : 'bg-surface border border-ui text-main rounded-tl-sm rounded-tr-2xl rounded-bl-2xl rounded-br-2xl'
              }`}
            >
              {msg.role === 'bot' && msg.id !== 'welcome' && (
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-cyan-300">Nix</div>
                  {(msg.status === 'progress' || msg.status === 'error' || (msg.status === 'done' && !!msg.txHash)) &&
                    statusBadge(msg.status)}
                </div>
              )}
              {msg.content}
              {msg.txHash && explorerBase && (
                <a
                  href={`${explorerBase}/tx/${msg.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block text-[10px] font-mono text-cyan-300 hover:underline break-all"
                >
                  View tx {msg.txHash.slice(0, 10)}...
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 p-4 border-t border-ui bg-app">
        {/* Suggested command chips */}
        {!busy && !pendingIntent && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[
              { label: 'Wrap 0.1 ETH', cmd: 'wrap 0.1 eth' },
              { label: 'Check Balances', cmd: 'check balance' },
              { label: 'Claim All', cmd: 'claim all pending' },
              ...Object.values(FHENIX_NETWORKS)
                .filter((net) => net.id !== getActiveNetwork().id)
                .map((net) => ({
                  label: `Switch to ${net.name.split(' ')[0]}`,
                  cmd: `switch network to ${net.name.toLowerCase()}`,
                })),
            ].map((chip) => (
              <button
                key={chip.cmd}
                type="button"
                onClick={() => {
                  setInput(chip.cmd);
                  inputRef.current?.focus();
                }}
                className="px-2 py-0.5 rounded border border-ui bg-surface text-[9px] text-sub font-semibold hover:text-brand-cyan hover:border-brand-cyan transition-colors uppercase tracking-wider"
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {pendingIntent && (
          <div className="mb-3 p-3 border border-brand-cyan bg-brand-cyan/10">
            <div className="text-[10px] uppercase tracking-wider text-brand-cyan font-bold mb-2">Awaiting confirmation</div>
            <pre className="text-xs text-main whitespace-pre-wrap font-sans">{pendingPreview || intentPreview(pendingIntent)}</pre>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void executeIntent(pendingIntent, { confirmed: true })}
                className="flex-1 bg-brand-cyan text-brand-midnight py-2 text-label-caps font-bold disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPendingIntent(null);
                  appendBot('Cancelled. Share a new command and I will prepare another preview.', { status: 'done' });
                  inputRef.current?.focus();
                }}
                className="flex-1 border border-ui py-2 text-label-caps text-main disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            placeholder="Message Nix Bot..."
            rows={2}
            className="flex-1 bg-surface border border-ui p-3 text-sm resize-none focus:outline-none focus:border-brand-cyan disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || !input.trim()}
            className="shrink-0 w-12 h-12 bg-brand-cyan text-brand-midnight flex items-center justify-center disabled:opacity-50 transition-opacity"
            aria-label="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="mt-2 text-[10px] text-sub text-center">Enter to send · Shift+Enter for new line</p>
      </div>

      {showGuide && (
        <div className="fixed inset-0 z-20 bg-black/60 flex items-end">
          <div className="w-full bg-app border-t border-ui p-4 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider">Nix Bot Guide</h2>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-2 py-1 border border-ui text-[10px] font-bold uppercase tracking-wider hover:text-brand-cyan hover:border-brand-cyan transition-colors"
              >
                Close
              </button>
            </div>

            <div className="text-xs leading-relaxed text-main space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-sub mb-1">How It Works</div>
                <p>Write your intent in plain language. Nix Bot parses it, runs safety checks, shows a preview, and waits for your confirmation before any state-changing transaction.</p>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-sub mb-1">Execution Flow</div>
                <div className="space-y-1">
                  <div>1. Parse command and validate token/address.</div>
                  <div>2. Run pre-checks (including private balance decryption).</div>
                  <div>3. Show preview with amount, token, recipient, and available balance.</div>
                  <div>4. Confirm or cancel.</div>
                  <div>5. Execute and post tx status updates with explorer link.</div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-sub mb-1">Commands</div>
                <div className="font-mono text-[11px] space-y-1">
                  <div>send 10 usdc to alice (or 0x...)</div>
                  <div>private send 5 cusdc to bob</div>
                  <div>wrap 0.3 eth</div>
                  <div>unwrap 2 cusdc</div>
                  <div>claim all usdc</div>
                  <div>reveal private balance usdc</div>
                  <div>check balance usdc</div>
                  <div>switch network base sepolia</div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-sub mb-1">Status Badges</div>
                <div className="space-y-1">
                  <div>In Progress: current step still processing.</div>
                  <div>Completed: step finished successfully.</div>
                  <div>Failed: step stopped with a recoverable error.</div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-sub mb-1">Safety Notes</div>
                <div className="space-y-1">
                  <div>Always verify recipient addresses in the preview.</div>
                  <div>Private sends require decrypted balance availability first.</div>
                  <div>If a task times out, retry or use reveal/claim commands directly.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showHistory && (
        <div className="fixed inset-0 z-20 bg-black/60 flex items-end">
          <div className="w-full bg-app border-t border-ui p-4 space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider">Command History</h2>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="px-2 py-1 border border-ui text-[10px] font-bold uppercase tracking-wider hover:text-brand-cyan hover:border-brand-cyan transition-colors"
              >
                Close
              </button>
            </div>
            {history.length === 0 ? (
              <div className="text-xs text-sub">No commands yet.</div>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setInput(item.command);
                      setShowHistory(false);
                      inputRef.current?.focus();
                    }}
                    className="w-full text-left p-2.5 border border-ui bg-surface hover:border-brand-cyan transition-colors"
                  >
                    <div className="text-sm">{item.command}</div>
                    <div className="text-[10px] text-sub mt-1">{new Date(item.createdAt).toLocaleString()}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
