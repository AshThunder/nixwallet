import { describe, expect, it } from 'vitest';
import { getNativeEthFaucetUrl, getStablecoinFaucetUrl } from './testnetFaucets';

describe('testnetFaucets', () => {
  it('exposes Google ETH faucet on Sepolia', () => {
    expect(getNativeEthFaucetUrl('sepolia')).toContain('cloud.google.com');
  });

  it('exposes Circle faucet for USDC only', () => {
    expect(getStablecoinFaucetUrl('sepolia', 'USDC')).toBe('https://faucet.circle.com/');
    expect(getStablecoinFaucetUrl('sepolia', 'USDT')).toBeUndefined();
  });

  it('returns undefined for unknown symbols', () => {
    expect(getStablecoinFaucetUrl('sepolia', 'DAI')).toBeUndefined();
  });
});
