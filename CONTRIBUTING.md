# Contributing

Thank you for your interest in contributing to NixWallet!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/nixwallet.git`
3. **Extension:** `cd extension && npm install` — then `npm run dev` (Vite + HMR) or `npm run build` for a production bundle
4. **Contracts (optional):** `cd hardhat && pnpm install` — see `hardhat/README.md` for `compile` / `deploy`
5. Load the **`extension/dist`** folder as an unpacked extension in Chrome (after `npm run build` in `extension/`)

## Development Guidelines

- **TypeScript** is required for all new code
- **Tailwind CSS v4** for styling — no inline style objects
- Follow the existing "Technical Noir" design language (dark theme, cyan accents, monospace labels)
- Each screen is a self-contained component in `src/screens/`
- Business logic goes in `src/lib/`, not in screen components
- Use `lucide-react` for icons

## Pull Requests

- Create a feature branch from `main`
- Keep PRs focused on a single feature or fix
- Include a brief description of what changed and why
- Make sure `npx tsc --noEmit` passes with no errors
- Test in Chrome by loading the built extension

## Reporting Issues

Open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- Browser version and OS

## Code of Conduct

Be respectful. This is a learning project built during a hackathon. Constructive feedback is welcome; hostility is not.
