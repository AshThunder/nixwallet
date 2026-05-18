import { describe, expect, it } from 'vitest';
import { mergePrivateBalancesOnFetch, resetPrivateBalanceState } from './privateBalanceState';

describe('privateBalanceState', () => {
  it('resetPrivateBalanceState hides all balances', () => {
    expect(resetPrivateBalanceState()).toEqual({
      ethPrivateBalance: '***',
      customPrivateBalances: {},
    });
  });

  it('mergePrivateBalancesOnFetch preserves revealed values on refresh', () => {
    const prev = {
      '0xabc': '1.5',
      '0xdef': '***',
    };
    const merged = mergePrivateBalancesOnFetch(prev, ['0xabc', '0xdef', '0xnew']);
    expect(merged['0xabc']).toBe('1.5');
    expect(merged['0xdef']).toBe('***');
    expect(merged['0xnew']).toBe('***');
  });

  it('mergePrivateBalancesOnFetch does not carry over addresses from another wallet', () => {
    const prev = { '0xold': '9.9' };
    const merged = mergePrivateBalancesOnFetch(prev, ['0xnew']);
    expect(merged['0xold']).toBeUndefined();
    expect(merged['0xnew']).toBe('***');
  });
});
