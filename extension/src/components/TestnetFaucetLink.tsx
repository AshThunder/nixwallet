import { Droplets, ExternalLink } from 'lucide-react';

interface Props {
  href: string;
  label?: string;
}

/** Tiny external link for testnet faucets; stops card click propagation. */
export default function TestnetFaucetLink({ href, label = 'Faucet' }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand-cyan hover:text-brand-cyan/80 transition-colors"
    >
      <Droplets className="w-3 h-3 shrink-0" aria-hidden />
      {label}
      <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-60" aria-hidden />
    </a>
  );
}
