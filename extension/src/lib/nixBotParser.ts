import type { TokenMetadata } from './tokens';

export type NixBotAction = 'send' | 'wrap' | 'unwrap' | 'claimAll' | 'revealBalance' | 'checkBalance' | 'switchNetwork';
export type SendMode = 'public' | 'private';

export interface NixBotToken {
  symbol: string;
  address: string;
  decimals: number;
  isNative?: boolean;
}

export interface NixBotIntent {
  action: NixBotAction;
  mode?: SendMode;
  amount?: string;
  recipient?: string;
  token?: NixBotToken | null;
  errors: string[];
  normalized: string;
}

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;
const AMOUNT_RE = /(\d+(?:\.\d+)?)/;

function normalize(input: string): string {
  let s = input
    .trim()
    .toLowerCase()
    .replace(/[,\n\t!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^hey nix\s+/, '')
    .replace(/^nix\s+/, '');
  if (s.endsWith('.')) {
    s = s.slice(0, -1);
  }
  return s.trim();
}

const LEADING_FILLER = [
  /^(?:hey|hi|hello|ok|okay|yo|thanks|thank you)\s+/,
  /^please\s+/,
  /^(?:can|could|would)\s+you\s+/,
  /^i\s+(?:want|need|would like|d like)\s+to\s+/,
  /^i\s+(?:want|need)\s+/,
  /^help\s+me\s+/,
  /^just\s+/,
  /^go\s+ahead\s+and\s+/,
  /^let(?:'s| us)\s+/,
] as const;

/** Converts conversational phrasing into compact command grammar. */
export function canonicalizeCommand(input: string): string {
  let s = normalize(input);
  if (!s) return s;

  s = s.replace(/\btransfer\b/g, 'send');
  s = s.replace(/\bconfidential\b/g, 'private');

  let prev = '';
  while (prev !== s) {
    prev = s;
    for (const pattern of LEADING_FILLER) {
      s = s.replace(pattern, '');
    }
  }

  s = s.replace(/\b(?:send)\s+(.+?)\s+privately\b/, 'private send $1');
  s = s.replace(/\bprivately\s+send\s+/, 'private send ');
  s = s.replace(/\b(?:confidentially|in private)\s+send\s+/, 'private send ');
  s = s.replace(/\bprivate(?:ly)?\s+send\s+/, 'private send ');

  s = s.replace(/^claim\s+all\s+(?:my\s+|the\s+|any\s+|pending\s+)+/, 'claim all ');
  if (/^claim\b/.test(s) && /\ball\b/.test(s)) {
    const tokenTail = s
      .replace(/^.*?\bclaim\s+all\b\s*/, '')
      .replace(/^(?:my|the|any|pending)\s+/, '')
      .trim();
    s = tokenTail ? `claim all ${tokenTail}` : 'claim all';
  }

  const addrInSend = s.match(ADDRESS_RE);
  if (addrInSend && /\bsend\b/.test(s) && !/\s+to\s+/.test(s)) {
    const addr = addrInSend[0];
    s = `${s.replace(addr, '').trim()} to ${addr}`.replace(/\s+/g, ' ');
  }

  s = s.replace(/\s+(?:for me|please)\s*$/, '');
  s = s.replace(/\s+(?:into|to)\s+(?:confidential|private|public)\s*$/, '');
  s = s.replace(/^(?:decrypt|show)\s+/, 'reveal ');
  if (/^(?:my\s+)?(?:private)\s+balance(?:\s+.+)?$/.test(s) || /^balance(?:\s+.+)?$/.test(s)) {
    s = `reveal ${s}`;
  }

  // Canonicalize switch network
  s = s.replace(/^(?:switch|change|use|connect to)\s+(?:network\s+)?(?:to\s+)?/, 'switch network ');

  // Canonicalize check balance
  s = s.replace(/^(?:check|what's|whats|get|view|show)\s+(?:my\s+)?balance\b/, 'check balance');
  s = s.replace(/^(?:check|what's|whats|get|view|show)\s+(?:my\s+)?(.+?)\s+balance\b/, 'check balance $1');
  s = s.replace(/^(?:check|what's|whats|get|view|show)\s+(?:my\s+)?balance\s+(?:for\s+|of\s+)?(.+)$/, 'check balance $1');

  return s.trim();
}

function tokenAliases(tokens: NixBotToken[]): Map<string, NixBotToken> {
  const map = new Map<string, NixBotToken>();
  for (const token of tokens) {
    const symbol = token.symbol.toLowerCase();
    map.set(symbol, token);
    map.set(`c${symbol}`, token);
    if (symbol === 'eth') {
      map.set('ceth', token);
      map.set('native', token);
    }
  }
  return map;
}

function extractTokenSymbol(words: string[]): string | null {
  for (const word of words) {
    if (/^[a-z][a-z0-9]{1,10}$/.test(word)) return word;
  }
  return null;
}

export function toNixBotTokens(native: { symbol: string; address: string }, customTokens: TokenMetadata[]): NixBotToken[] {
  return [
    { symbol: native.symbol, address: native.address, decimals: 18, isNative: true },
    ...customTokens.map((t) => ({ symbol: t.symbol, address: t.address, decimals: t.decimals })),
  ];
}

export function parseNixCommand(
  input: string,
  tokens: NixBotToken[],
  contacts: { name: string; address: string }[] = [],
): NixBotIntent | null {
  const normalized = canonicalizeCommand(input);
  if (!normalized) return null;

  const aliases = tokenAliases(tokens);
  const errors: string[] = [];

  if (normalized.startsWith('switch network')) {
    const tail = normalized.replace('switch network', '').trim();
    let networkId: string | null = null;
    let networkName = '';
    if (tail.includes('base')) {
      networkId = 'baseSepolia';
      networkName = 'Base Sepolia';
    } else if (tail.includes('arb') || tail.includes('arbitrum')) {
      networkId = 'arbitrumSepolia';
      networkName = 'Arbitrum Sepolia';
    } else if (tail.includes('sepolia') || tail.includes('eth') || tail.includes('ethereum')) {
      networkId = 'sepolia';
      networkName = 'Ethereum Sepolia';
    }
    if (!networkId) {
      errors.push(`Network "${tail}" not recognized. Try Sepolia, Base Sepolia, or Arbitrum Sepolia.`);
    }
    return { action: 'switchNetwork', recipient: networkId || undefined, amount: networkName, errors, normalized };
  }

  if (normalized.startsWith('check balance')) {
    const tail = normalized.replace('check balance', '').trim();
    let token: NixBotToken | null = null;
    if (tail) token = aliases.get(tail) || null;
    if (tail && !token) errors.push(`Unknown token "${tail}" for balance check.`);
    return { action: 'checkBalance', token, errors, normalized };
  }

  if (normalized.startsWith('claim all')) {
    const tail = normalized.replace('claim all', '').trim();
    let token: NixBotToken | null = null;
    if (tail) token = aliases.get(tail) || null;
    if (tail && !token) errors.push(`Unknown token "${tail}" for claim all.`);
    return { action: 'claimAll', token, errors, normalized };
  }

  if (normalized.startsWith('reveal ')) {
    const tail = normalized
      .replace(/^reveal\s+/, '')
      .replace(/\b(?:my|private|balance|for|of)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    let token: NixBotToken | null = null;
    if (tail) token = aliases.get(tail) || null;
    if (tail && !token) errors.push(`Unknown token "${tail}" for balance reveal.`);
    return { action: 'revealBalance', token, errors, normalized };
  }

  const sendMatch = normalized.match(/^(private\s+)?send\s+(.+)$/);
  if (sendMatch) {
    const explicitPrivate = Boolean(sendMatch[1]);
    const body = sendMatch[2];
    const toIdx = body.lastIndexOf(' to ');
    if (toIdx === -1) {
      errors.push('Missing recipient. Use: send <amount> <token> to <address>.');
      return { action: 'send', mode: explicitPrivate ? 'private' : 'public', errors, normalized };
    }
    const lhs = body.slice(0, toIdx).trim();
    const rhs = body.slice(toIdx + 4).trim();
    const amount = lhs.match(AMOUNT_RE)?.[1];
    let recipient = rhs.match(ADDRESS_RE)?.[0];
    if (!recipient) {
      const foundContact = contacts.find((c) => c.name.toLowerCase() === rhs.toLowerCase());
      if (foundContact) {
        recipient = foundContact.address;
      }
    }
    if (!amount) errors.push('Missing amount.');
    if (!recipient) errors.push('Recipient must be a valid 0x address or saved contact name.');

    const tokenWord = extractTokenSymbol(lhs.replace(AMOUNT_RE, '').trim().split(' ').filter(Boolean));
    const token = tokenWord ? aliases.get(tokenWord) || null : null;
    if (!token) errors.push('Token not recognized on this network.');

    const impliedPrivate = !!tokenWord && tokenWord.startsWith('c');
    const mode: SendMode = explicitPrivate || impliedPrivate ? 'private' : 'public';
    return { action: 'send', mode, amount, recipient, token, errors, normalized };
  }

  const wrapMatch = normalized.match(/^wrap\s+(.+)$/);
  if (wrapMatch) {
    const body = wrapMatch[1].trim();
    const amount = body.match(AMOUNT_RE)?.[1];
    if (!amount) errors.push('Missing amount.');
    const tokenWord = extractTokenSymbol(body.replace(AMOUNT_RE, '').trim().split(' ').filter(Boolean));
    const token = tokenWord ? aliases.get(tokenWord) || null : null;
    if (!token) errors.push('Token not recognized on this network.');
    return { action: 'wrap', amount, token, errors, normalized };
  }

  const unwrapMatch = normalized.match(/^unwrap\s+(.+)$/);
  if (unwrapMatch) {
    const body = unwrapMatch[1].trim();
    const amount = body.match(AMOUNT_RE)?.[1];
    if (!amount) errors.push('Missing amount.');
    const tokenWord = extractTokenSymbol(body.replace(AMOUNT_RE, '').trim().split(' ').filter(Boolean));
    const token = tokenWord ? aliases.get(tokenWord) || null : null;
    if (!token) errors.push('Token not recognized on this network.');
    return { action: 'unwrap', amount, token, errors, normalized };
  }

  return {
    action: 'send',
    errors: ['I did not quite get that. Try "send 1 usdc to 0x..." or "i want to wrap 0.3 eth".'],
    normalized,
  };
}
