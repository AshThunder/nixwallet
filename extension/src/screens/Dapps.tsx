import { ArrowLeft, Trash2, Link } from 'lucide-react';

interface Props {
  onBack: () => void;
}

export default function DappsScreen({ onBack }: Props) {
  return (
    <div className="w-[360px] h-[600px] bg-app text-main font-sans flex flex-col relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-[100px] left-[-100px] w-64 h-64 bg-brand-cyan/5 mix-blend-screen filter blur-[100px]" />

      {/* Header */}
      <header className="w-full p-6 flex flex-col gap-2 relative z-10 border-b border-ui">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-sub hover:text-brand-cyan transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold font-brand uppercase tracking-tighter">Connected DApps</h1>
        </div>
        <p className="text-xs text-sub pl-9">Manage websites connected to your wallet.</p>
      </header>

      {/* Mock Content */}
      <main className="flex-1 p-6 relative z-10 space-y-4">
        {[
          { name: 'Fhenix Explorer', url: 'explorer.fhenix.zone', icon: 'F' },
          { name: 'Redact Money', url: 'test.redact.money', icon: 'R' },
          { name: 'CarrotBox', url: 'carrotboxfhe.vercel.app', icon: 'C' }
        ].map((app, i) => (
          <div key={i} className="bg-surface border border-ui p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-app border border-ui flex items-center justify-center text-sm font-bold text-brand-cyan">
                {app.icon}
              </div>
              <div>
                <div className="text-sm font-bold">{app.name}</div>
                <div className="text-xs text-sub font-mono">{app.url}</div>
              </div>
            </div>
            <button className="text-sub p-2 cursor-not-allowed">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </main>

      {/* Coming Soon Overlay */}
      <div className="absolute inset-x-0 bottom-0 top-[80px] z-50 backdrop-blur-sm bg-app/80 flex flex-col items-center justify-center p-6 text-center border-t border-ui">
        <div className="w-16 h-16 bg-brand-cyan/10 border border-brand-cyan/20 flex items-center justify-center mb-6">
          <Link className="w-8 h-8 text-brand-cyan" />
        </div>
        <h2 className="text-2xl font-brand font-bold uppercase tracking-tighter mb-2 text-brand-cyan glow-cyan">
          DApp Manager
        </h2>
        <p className="text-sm tracking-wide text-sub mb-8 leading-relaxed">
          The permissions manager is under construction. Soon, you will be able to review and revoke access to connected dApps directly from this screen.
        </p>
        <div className="px-6 py-2 bg-brand-cyan text-brand-midnight text-label-caps font-bold shadow-[0_0_15px_rgba(34,211,238,0.4)]">
          Coming Soon
        </div>
      </div>
    </div>
  );
}
