import ethLogo from '../assets/tokens/eth.png';
import usdcLogo from '../assets/tokens/usdc.png';
import usdtLogo from '../assets/tokens/usdt.png';
import btcLogo from '../assets/tokens/btc.png';

const LOGO_BY_SYMBOL: Record<string, string> = {
  ETH: ethLogo,
  WETH: ethLogo,
  USDC: usdcLogo,
  USDT: usdtLogo,
  BTC: btcLogo,
  WBTC: btcLogo,
};

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function getTokenLogoUrl(symbol: string): string | undefined {
  return LOGO_BY_SYMBOL[normalizeSymbol(symbol)];
}

export function hasTokenLogo(symbol: string): boolean {
  return normalizeSymbol(symbol) in LOGO_BY_SYMBOL;
}
