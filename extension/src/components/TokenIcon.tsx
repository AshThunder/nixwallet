import { getTokenLogoUrl } from '../lib/tokenLogos';

interface TokenIconProps {
  symbol: string;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
}

/** Renders a bundled logo for ETH, USDC, USDT, BTC/WBTC; otherwise the first letter. */
export default function TokenIcon({
  symbol,
  className = 'w-10 h-10 shrink-0 flex items-center justify-center border border-ui bg-app overflow-hidden',
  imgClassName = 'w-full h-full object-cover',
  fallbackClassName = 'text-main font-bold text-sm',
}: TokenIconProps) {
  const src = getTokenLogoUrl(symbol);

  if (src) {
    return (
      <div className={className} aria-hidden>
        <img src={src} alt="" className={imgClassName} />
      </div>
    );
  }

  return (
    <div className={className}>
      <span className={fallbackClassName}>{symbol[0] ?? '?'}</span>
    </div>
  );
}
