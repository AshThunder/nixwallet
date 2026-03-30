import { motion } from 'framer-motion';
import { ExternalLink, Zap, Shield, Lock, Gamepad2 } from 'lucide-react';

interface DApp {
  name: string;
  description: string;
  url: string;
  icon: React.ReactNode;
  category: string;
}

const DAPPS: DApp[] = [
  {
    name: 'Fhenix.io',
    description: 'The official home of the Fhenix ecosystem.',
    url: 'https://www.fhenix.io/',
    icon: <Zap className="w-5 h-5 text-brand-cyan" />,
    category: 'OFFICIAL',
  },
  {
    name: 'CoFHE Docs',
    description: 'Master confidential computing with the latest documentation.',
    url: 'https://cofhe-docs.fhenix.zone/',
    icon: <Shield className="w-5 h-5 text-brand-cyan" />,
    category: 'DEVELOPMENT',
  },
  {
    name: 'Redact Money',
    description: 'Privacy-focused financial tools on Fhenix testnet.',
    url: 'https://test.redact.money/',
    icon: <Lock className="w-5 h-5 text-brand-cyan" />,
    category: 'FINANCE',
  },
  {
    name: 'CarrotBox',
    description: 'A FHE-powered game of bluffing and logic, inspired by the classic show.',
    url: 'https://carrotboxfhe.vercel.app/',
    icon: <Gamepad2 className="w-5 h-5 text-brand-cyan" />,
    category: 'GAMES',
  },
];

export default function Discover() {
  const openLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="w-full h-full flex flex-col font-sans">
      <div className="px-1 mb-8">
        <div className="text-label-caps text-brand-cyan mb-2">Discover</div>
        <h2 className="text-2xl font-bold font-brand tracking-tighter uppercase">Recommended Apps</h2>
      </div>

      <div className="space-y-1 pb-6 overflow-y-auto no-scrollbar">
        {DAPPS.map((dapp, idx) => (
          <motion.button
            key={dapp.name}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => openLink(dapp.url)}
            className="w-full bg-surface hover:bg-input-field p-5 flex items-start gap-5 transition-all group text-left border-l-2 border-transparent hover:border-brand-cyan"
          >
            <div className="w-12 h-12 bg-ui flex items-center justify-center shrink-0 group-hover:bg-brand-cyan transition-colors group-hover:shadow-[0_0_20px_rgba(10,217,220,0.3)]">
              <div className="group-hover:text-brand-midnight transition-colors">
                {dapp.icon}
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold font-brand uppercase tracking-tighter text-main">{dapp.name}</span>
                <ExternalLink className="w-3 h-3 text-muted group-hover:text-brand-cyan transition-colors" />
              </div>
              <p className="text-[10px] text-sub leading-normal line-clamp-2">
                {dapp.description}
              </p>
              <div className="mt-3 text-[8px] font-bold uppercase tracking-widest text-brand-cyan/40 group-hover:text-brand-cyan/80 transition-colors">
                {dapp.category}
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <div className="mt-auto p-6 bg-surface border border-ui">
        <p className="text-[9px] text-sub font-label-caps tracking-tighter text-center leading-relaxed">
          The Fhenix ecosystem is growing. Join the <span className="text-brand-cyan">community</span> to find more apps.
        </p>
      </div>
    </div>
  );
}
