import type { VerifiedTokenMeta } from './verifiedTokens';

export type TrustStatus = 'verified' | 'unverified' | 'insufficientLiquidity' | 'noData';

export interface MarketSnapshot {
  usd?: number;
  usd_24h_vol?: number;
}

export function evaluateTokenTrust(
  meta: VerifiedTokenMeta | null,
  market: MarketSnapshot | undefined
): TrustStatus {
  if (!meta) return 'unverified';
  if (!market || typeof market.usd !== 'number' || !Number.isFinite(market.usd)) return 'noData';

  const vol = market.usd_24h_vol;
  if (typeof vol === 'number' && Number.isFinite(vol) && vol < meta.min24hVolumeUsd) {
    return 'insufficientLiquidity';
  }
  return 'verified';
}
