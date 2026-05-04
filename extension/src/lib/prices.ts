import type { TokenMetadata } from './tokens';
import { evaluateTokenTrust, type TrustStatus } from './tokenTrust';
import { getVerifiedTokenMeta } from './verifiedTokens';

const PRICE_CACHE_KEY = 'nixwallet_price_cache_v1';
const PRICE_TTL_MS = 60_000;

interface CachedNetworkPrices {
  updatedAt: number;
  tokenPrices: Record<string, TokenPriceResult>;
  ethPrice: NativePriceResult | null;
}

interface PriceCacheRecord {
  [networkId: string]: CachedNetworkPrices;
}

export interface TokenPriceResult {
  address: string;
  usd: number | null;
  lastUpdated: number;
  source: 'coingecko' | 'cache';
  trustStatus: TrustStatus;
  stale: boolean;
}

export interface NativePriceResult {
  usd: number | null;
  lastUpdated: number;
  source: 'coingecko' | 'cache';
  stale: boolean;
}

function isStale(updatedAt: number): boolean {
  return Date.now() - updatedAt > PRICE_TTL_MS;
}

async function getCache(): Promise<PriceCacheRecord> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return {};
  const res = await chrome.storage.local.get([PRICE_CACHE_KEY]);
  return (res[PRICE_CACHE_KEY] || {}) as PriceCacheRecord;
}

async function setCache(next: PriceCacheRecord): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [PRICE_CACHE_KEY]: next });
}

function cacheToTokenResults(cached: CachedNetworkPrices): Record<string, TokenPriceResult> {
  const stale = isStale(cached.updatedAt);
  const out: Record<string, TokenPriceResult> = {};
  for (const [address, value] of Object.entries(cached.tokenPrices || {})) {
    out[address.toLowerCase()] = { ...value, source: 'cache', stale, lastUpdated: cached.updatedAt };
  }
  return out;
}

async function fetchSimplePricesByIds(ids: string[]): Promise<Record<string, { usd?: number; usd_24h_vol?: number }>> {
  if (ids.length === 0) return {};
  const unique = [...new Set(ids)];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(unique.join(','))}&vs_currencies=usd&include_24hr_vol=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Price API failed (${res.status})`);
  return (await res.json()) as Record<string, { usd?: number; usd_24h_vol?: number }>;
}

export async function getUsdPrices(networkId: string, tokens: TokenMetadata[]): Promise<Record<string, TokenPriceResult>> {
  const now = Date.now();
  const cache = await getCache();
  const cached = cache[networkId];

  const metaByAddress = new Map<string, ReturnType<typeof getVerifiedTokenMeta>>();
  for (const token of tokens) {
    metaByAddress.set(token.address.toLowerCase(), getVerifiedTokenMeta(networkId, token.address));
  }

  const ids = Array.from(new Set(
    [...metaByAddress.values()]
      .filter((meta): meta is NonNullable<typeof meta> => !!meta)
      .map((meta) => meta.coingeckoId)
  ));

  try {
    const byId = await fetchSimplePricesByIds(ids);
    const results: Record<string, TokenPriceResult> = {};

    for (const token of tokens) {
      const address = token.address.toLowerCase();
      const meta = metaByAddress.get(address) || null;
      const market = meta ? byId[meta.coingeckoId] : undefined;
      const trustStatus = evaluateTokenTrust(meta, market);
      results[address] = {
        address: token.address,
        usd: trustStatus === 'verified' ? (market?.usd ?? null) : null,
        lastUpdated: now,
        source: 'coingecko',
        trustStatus,
        stale: false,
      };
    }

    cache[networkId] = {
      updatedAt: now,
      tokenPrices: results,
      ethPrice: cached?.ethPrice || null,
    };
    await setCache(cache);
    return results;
  } catch {
    if (cached) return cacheToTokenResults(cached);

    const empty: Record<string, TokenPriceResult> = {};
    for (const token of tokens) {
      empty[token.address.toLowerCase()] = {
        address: token.address,
        usd: null,
        lastUpdated: now,
        source: 'cache',
        trustStatus: 'noData',
        stale: true,
      };
    }
    return empty;
  }
}

export async function getNativeEthPrice(networkId: string): Promise<NativePriceResult> {
  const now = Date.now();
  const cache = await getCache();
  const cached = cache[networkId];

  try {
    const byId = await fetchSimplePricesByIds(['ethereum']);
    const usd = byId.ethereum?.usd;
    const result: NativePriceResult = {
      usd: typeof usd === 'number' ? usd : null,
      lastUpdated: now,
      source: 'coingecko',
      stale: false,
    };
    cache[networkId] = {
      updatedAt: now,
      tokenPrices: cached?.tokenPrices || {},
      ethPrice: result,
    };
    await setCache(cache);
    return result;
  } catch {
    if (cached?.ethPrice) {
      return {
        ...cached.ethPrice,
        source: 'cache',
        lastUpdated: cached.updatedAt,
        stale: isStale(cached.updatedAt),
      };
    }
    return { usd: null, lastUpdated: now, source: 'cache', stale: true };
  }
}
