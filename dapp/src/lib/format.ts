import { formatUnits } from 'ethers';

/** Truncate fractional digits and trim trailing zeros for UI display. */
export function formatAmountDisplay(
  amount: bigint,
  tokenDecimals: number,
  displayDecimals = 4,
): string {
  const formatted = formatUnits(amount, tokenDecimals);
  const [whole, frac = ''] = formatted.split('.');
  const trimmed = frac.slice(0, displayDecimals).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
}
