/** Helpers for per-wallet private balance UI state (dashboard). */

export function mergePrivateBalancesOnFetch(
  prev: Record<string, string | null>,
  tokenAddresses: string[],
): Record<string, string | null> {
  const updated: Record<string, string | null> = {};
  for (const addr of tokenAddresses) {
    updated[addr] = prev[addr] ?? '***';
  }
  return updated;
}

export function resetPrivateBalanceState(): {
  ethPrivateBalance: '***';
  customPrivateBalances: Record<string, string | null>;
} {
  return {
    ethPrivateBalance: '***',
    customPrivateBalances: {},
  };
}
