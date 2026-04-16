/**
 * Shared custom token storage helpers.
 * Centralizes the `custom_tokens_${networkId}` pattern used by
 * Dashboard, WrapUnwrap, ManageTokens, and Send.
 */

export interface TokenMetadata {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  isDefault?: boolean;
}

function storageKey(networkId: string): string {
  return `custom_tokens_${networkId}`;
}

export async function getCustomTokens(networkId: string): Promise<TokenMetadata[]> {
  if (typeof chrome === 'undefined' || !chrome.storage) return [];
  const key = storageKey(networkId);
  const res = await chrome.storage.local.get([key]);
  return (res[key] || []) as TokenMetadata[];
}

export async function saveCustomTokens(networkId: string, tokens: TokenMetadata[]): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  const key = storageKey(networkId);
  await chrome.storage.local.set({ [key]: tokens });
}

const SEPOLIA_DEFAULTS: TokenMetadata[] = [
  { symbol: 'USDT', name: 'Tether USD', address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', decimals: 6, isDefault: true },
  { symbol: 'USDC', name: 'USD Coin', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6, isDefault: true },
];

/**
 * Ensure Sepolia defaults are injected once. Returns the final token list.
 */
export async function ensureDefaults(networkId: string): Promise<TokenMetadata[]> {
  if (networkId !== 'sepolia') return getCustomTokens(networkId);

  const injectedKey = `injected_defaults_${networkId}`;
  const injectedRes = await chrome.storage.local.get([injectedKey]);
  if (injectedRes[injectedKey]) return getCustomTokens(networkId);

  const customs = await getCustomTokens(networkId);
  let changed = false;
  for (const def of SEPOLIA_DEFAULTS) {
    if (!customs.find(c => c.address.toLowerCase() === def.address.toLowerCase())) {
      customs.push(def);
      changed = true;
    }
  }
  if (changed) await saveCustomTokens(networkId, customs);
  await chrome.storage.local.set({ [injectedKey]: true });
  return customs;
}
