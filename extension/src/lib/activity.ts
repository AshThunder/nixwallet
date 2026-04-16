/**
 * Activity — Local transaction history tracking
 */

export type ActivityType = 'send' | 'receive' | 'wrap' | 'unwrap' | 'confidential-transfer' | 'swap';

export interface Activity {
  id: string;
  type: ActivityType;
  amount: string;
  status: 'pending' | 'success' | 'error';
  timestamp: number;
  networkId: string;
  address: string; // Filter by user address
  isConfidential: boolean;
  hash?: string; // Transaction hash for explorer
  recipient?: string;
}

const STORAGE_KEY = 'nixwallet_activity';

// Helper to get storage (chrome.storage.local or localStorage)
async function getStorageData(key: string): Promise<unknown> {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const res = await chrome.storage.local.get(key);
    return res[key];
  }
  const local = localStorage.getItem(key);
  return local ? JSON.parse(local) : undefined;
}

async function setStorageData(key: string, value: unknown) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    await chrome.storage.local.set({ [key]: value });
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

/** Add a new activity to the local history */
export async function addActivity(activity: Omit<Activity, 'timestamp'>) {
  const newActivity: Activity = {
    ...activity,
    timestamp: Date.now(),
  };

  const stored = await getStorageData(STORAGE_KEY);
  const history = Array.isArray(stored) ? stored as Activity[] : [];

  const index = history.findIndex(a => a.id === activity.id);
  if (index !== -1) {
    history[index] = newActivity;
  } else {
    history.unshift(newActivity);
  }

  await setStorageData(STORAGE_KEY, history.slice(0, 50));
}

/** Get all activities for a specific network and address */
export async function getActivities(networkId: string, address: string): Promise<Activity[]> {
  const stored = await getStorageData(STORAGE_KEY);
  const history = Array.isArray(stored) ? stored as Activity[] : [];

  return history.filter(a => {
    const netMatch = a.networkId?.toLowerCase() === networkId?.toLowerCase();
    // Strict match: Only show activities that explicitly match this wallet
    const addrMatch = address && a.address && a.address.toLowerCase() === address.toLowerCase();
    return netMatch && addrMatch;
  });
}

/** Clear activity history. If networkId/address given, only clear matching entries. */
export async function clearActivities(networkId?: string, address?: string) {
  if (!networkId && !address) {
    await setStorageData(STORAGE_KEY, []);
    return;
  }

  const stored = await getStorageData(STORAGE_KEY);
  const history = Array.isArray(stored) ? stored as Activity[] : [];
  const filtered = history.filter(a => {
    const netMatch = networkId ? a.networkId?.toLowerCase() === networkId.toLowerCase() : true;
    const addrMatch = address ? a.address?.toLowerCase() === address.toLowerCase() : true;
    return !(netMatch && addrMatch);
  });
  await setStorageData(STORAGE_KEY, filtered);
}
