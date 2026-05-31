import { describe, expect, it } from 'vitest';
import { canonicalizeCommand, parseNixCommand, toNixBotTokens } from './nixBotParser';

const TOKENS = toNixBotTokens(
  { symbol: 'ETH', address: 'native' },
  [{ symbol: 'USDC', name: 'USD Coin', address: '0x1111111111111111111111111111111111111111', decimals: 6 }],
);

const ADDR = '0x92dbfac3d6f11c1a8eeb8de75e8e82866b2f5f1e';

describe('canonicalizeCommand', () => {
  it('strips conversational send prefixes', () => {
    expect(canonicalizeCommand(`i want to send 1 usdc to ${ADDR}`)).toBe(`send 1 usdc to ${ADDR}`);
    expect(canonicalizeCommand(`please can you send 2 usdc to ${ADDR}`)).toBe(`send 2 usdc to ${ADDR}`);
  });

  it('normalizes private send phrasing', () => {
    expect(canonicalizeCommand(`i want to privately send 1 cusdc to ${ADDR}`)).toBe(
      `private send 1 cusdc to ${ADDR}`,
    );
  });

  it('normalizes claim all phrasing', () => {
    expect(canonicalizeCommand('claim all my usdc')).toBe('claim all usdc');
    expect(canonicalizeCommand('i want to claim all usdc')).toBe('claim all usdc');
  });

  it('normalizes reveal balance phrasing', () => {
    expect(canonicalizeCommand('show private balance usdc')).toBe('reveal private balance usdc');
    expect(canonicalizeCommand('decrypt confidential balance usdc')).toBe('reveal private balance usdc');
  });
});

describe('parseNixCommand', () => {
  it('parses natural-language send', () => {
    const intent = parseNixCommand(`i want to send 1 usdc to ${ADDR}`, TOKENS);
    expect(intent?.errors).toEqual([]);
    expect(intent?.action).toBe('send');
    expect(intent?.amount).toBe('1');
    expect(intent?.recipient?.toLowerCase()).toBe(ADDR);
    expect(intent?.token?.symbol).toBe('USDC');
  });

  it('parses direct send', () => {
    const intent = parseNixCommand(`send 10 usdc to ${ADDR}`, TOKENS);
    expect(intent?.errors).toEqual([]);
    expect(intent?.action).toBe('send');
  });

  it('parses reveal balance commands', () => {
    const tokenIntent = parseNixCommand('reveal private balance usdc', TOKENS);
    expect(tokenIntent?.errors).toEqual([]);
    expect(tokenIntent?.action).toBe('revealBalance');
    expect(tokenIntent?.token?.symbol).toBe('USDC');

    const genericIntent = parseNixCommand('show private balance', TOKENS);
    expect(genericIntent?.errors).toEqual([]);
    expect(genericIntent?.action).toBe('revealBalance');
    expect(genericIntent?.token).toBeNull();
  });
});
