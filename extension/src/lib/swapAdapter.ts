export interface SwapTokenOption {
  symbol: string;
  address: string;
  decimals: number;
}

export interface SwapQuote {
  inputAmount: string;
  outputAmount: string;
  rate: number;
  priceImpactBps: number;
  provider: string;
  executable: boolean;
}

export interface SwapAdapter {
  getQuote(params: {
    fromToken: SwapTokenOption;
    toToken: SwapTokenOption;
    amount: string;
    slippageBps: number;
  }): Promise<SwapQuote>;
}

/**
 * Mock adapter for Wave 3 UI scaffolding.
 * Keeps execution disabled while providing realistic quote behavior.
 */
export const mockSwapAdapter: SwapAdapter = {
  async getQuote({ amount, fromToken, toToken }) {
    const n = Number(amount || '0');
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error('Enter a valid amount');
    }

    // Stable mock pricing map (replace in Wave 4 with live router quote)
    const key = `${fromToken.symbol}:${toToken.symbol}`;
    const rateMap: Record<string, number> = {
      'ETH:USDC': 3000,
      'USDC:ETH': 1 / 3000,
      'ETH:USDT': 3000,
      'USDT:ETH': 1 / 3000,
      'USDC:USDT': 0.9995,
      'USDT:USDC': 1.0005,
    };
    const rate = rateMap[key] ?? 1;
    const output = (n * rate).toFixed(Math.min(toToken.decimals, 6));
    const priceImpactBps = Math.min(120, Math.max(5, Math.round(n * 0.8)));

    return {
      inputAmount: amount,
      outputAmount: output,
      rate,
      priceImpactBps,
      provider: 'mock-router',
      executable: false,
    };
  },
};
