import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
  theme: 'light' | 'dark';
  onToggle: () => void;
}

export default function ThemeToggle({ theme, onToggle }: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onToggle}
      className="p-2 bg-surface border border-ui hover:bg-black/5 dark:hover:bg-white/10 transition-colors group flex items-center justify-center"
      title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
    >
      {theme === 'light' ? (
        <Moon className="w-4 h-4 text-sub group-hover:text-accent-cyan transition-colors" />
      ) : (
        <Sun className="w-4 h-4 text-brand-cyan glow-cyan transition-colors" />
      )}
    </motion.button>
  );
}
