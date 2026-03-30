/**
 * Secure Vault — Password-encrypted key storage
 * Uses PBKDF2 for key derivation and AES-GCM for encryption.
 * Keys are stored encrypted in chrome.storage.local.
 */

const VAULT_KEY = 'nixwallet_vault';
const SALT_KEY = 'nixwallet_salt';
const PBKDF2_ITERATIONS = 600_000;

export interface VaultData {
  mnemonic: string;
  privateKey: string;
  importedAccounts?: { address: string; privateKey: string; name?: string }[];
}

// ─── Crypto Helpers ───

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(data: string, key: CryptoKey): Promise<{ iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    key,
    enc.encode(data)
  );
  return {
    iv: bufToHex(iv),
    ciphertext: bufToHex(new Uint8Array(encrypted)),
  };
}

async function decryptData(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
  const ivBuf = hexToBuf(iv);
  const ctBuf = hexToBuf(ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuf as Uint8Array<ArrayBuffer> },
    key,
    ctBuf as Uint8Array<ArrayBuffer>
  );
  return new TextDecoder().decode(decrypted);
}

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ─── Storage Helpers ───

function storageGet(key: string): Promise<any> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise(resolve => chrome.storage.local.get(key, (r: Record<string, any>) => resolve(r[key])));
  }
  // Fallback for dev/testing
  const val = localStorage.getItem(key);
  return Promise.resolve(val ? JSON.parse(val) : undefined);
}

function storageSet(key: string, value: any): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
  }
  localStorage.setItem(key, JSON.stringify(value));
  return Promise.resolve();
}

function storageRemove(key: string): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return new Promise(resolve => chrome.storage.local.remove(key, resolve));
  }
  localStorage.removeItem(key);
  return Promise.resolve();
}

// ─── Public API ───

/** Check if a vault has been created */
export async function isVaultInitialized(): Promise<boolean> {
  const vault = await storageGet(VAULT_KEY);
  return !!vault;
}

/** Create or update the vault with password-encrypted data */
export async function createVault(data: VaultData, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await deriveKey(password, salt);
  const encrypted = await encryptData(JSON.stringify(data), key);

  await storageSet(SALT_KEY, bufToHex(salt));
  await storageSet(VAULT_KEY, encrypted);
}

/** Unlock the vault with password, returns decrypted vault data */
export async function unlockVault(password: string): Promise<VaultData> {
  const saltHex = await storageGet(SALT_KEY);
  const encrypted = await storageGet(VAULT_KEY);

  if (!saltHex || !encrypted) {
    throw new Error('Vault not initialized');
  }

  const key = await deriveKey(password, hexToBuf(saltHex));

  try {
    const raw = await decryptData(encrypted.ciphertext, encrypted.iv, key);
    return JSON.parse(raw) as VaultData;
  } catch {
    throw new Error('Incorrect password');
  }
}

/** Wipe the vault entirely */
export async function resetVault(): Promise<void> {
  await storageRemove(VAULT_KEY);
  await storageRemove(SALT_KEY);
  await clearSessionCache();
}

// ─── Session Cache (auto-unlock) ───

const SESSION_KEY = 'nixwallet_session';

/** Cache decrypted vault data for the current browser session */
export async function cacheSession(data: VaultData): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    await chrome.storage.session.set({ [SESSION_KEY]: data });
  }
}

/** Retrieve cached vault data from the current session (null if locked/expired) */
export async function getSessionCache(): Promise<VaultData | null> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    const res = await chrome.storage.session.get(SESSION_KEY);
    const cached: any = res[SESSION_KEY];
    if (cached && cached.mnemonic && cached.privateKey) {
      return cached as VaultData;
    }
    return null;
  }
  return null;
}

/** Clear session cache (on manual lock or reset) */
export async function clearSessionCache(): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    await chrome.storage.session.remove(SESSION_KEY);
  }
}
