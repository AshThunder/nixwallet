export interface DappPermission {
  origin: string;
  accounts: string[];
  connectedAt: number;
  lastUsedAt: number;
  activeChainId: number;
}

const STORAGE_KEY = 'nixwallet_dapp_permissions';

async function getStore(): Promise<Record<string, DappPermission>> {
  const res = await chrome.storage.local.get([STORAGE_KEY]);
  const raw = res[STORAGE_KEY];
  if (!raw || typeof raw !== 'object') return {};
  return raw as Record<string, DappPermission>;
}

async function setStore(store: Record<string, DappPermission>) {
  await chrome.storage.local.set({ [STORAGE_KEY]: store });
}

export async function listDappPermissions(): Promise<DappPermission[]> {
  const store = await getStore();
  return Object.values(store).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export async function getDappPermission(origin: string): Promise<DappPermission | null> {
  const store = await getStore();
  return store[origin] || null;
}

export async function upsertDappPermission(
  origin: string,
  accounts: string[],
  activeChainId: number
): Promise<DappPermission> {
  const store = await getStore();
  const existing = store[origin];
  const now = Date.now();
  const next: DappPermission = {
    origin,
    accounts,
    connectedAt: existing?.connectedAt || now,
    lastUsedAt: now,
    activeChainId,
  };
  store[origin] = next;
  await setStore(store);
  return next;
}

export async function touchDappPermission(origin: string, activeChainId: number) {
  const store = await getStore();
  const existing = store[origin];
  if (!existing) return;
  store[origin] = {
    ...existing,
    lastUsedAt: Date.now(),
    activeChainId,
  };
  await setStore(store);
}

export async function revokeDappPermission(origin: string) {
  const store = await getStore();
  if (!(origin in store)) return;
  delete store[origin];
  await setStore(store);
}
