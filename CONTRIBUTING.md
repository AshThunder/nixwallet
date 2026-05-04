# Contributing

Thank you for your interest in contributing to NixWallet!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/nixwallet.git`
3. **Extension:** `cd extension && npm install` — then `npm run dev` (Vite + HMR) or `npm run build` for a production bundle
4. **Companion dApp:** `cd dapp && npm install && npm run dev` — use it to test injected-provider approvals and FHERC20 flows
5. **Contracts (optional):** `cd hardhat && pnpm install` — see `hardhat/README.md` for `compile` / `deploy`
6. Load the **`extension/dist`** folder as an unpacked extension in Chrome (after `npm run build` in `extension/`)

## Development Guidelines

- **TypeScript** is required for all new code
- **Tailwind CSS v4** for styling — no inline style objects
- Follow the existing "Technical Noir" design language (dark theme, cyan accents, monospace labels)
- Each screen is a self-contained component in `src/screens/`
- Business logic goes in `src/lib/`, not in screen components
- Use `lucide-react` for icons
- Keep external dApp signing/approval UX inside NixWallet. The companion dApp should initiate requests, not become the trusted confirmation surface.

## Pull Requests

- Create a feature branch from `main`
- Keep PRs focused on a single feature or fix
- Include a brief description of what changed and why
- Make sure the relevant `npm run lint` and `npm run build` commands pass
- Test in Chrome by loading the built extension
- For provider changes, also test from `dapp/` with a freshly refreshed dApp tab and reloaded extension build

## Reporting Issues

Open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behavior
- Browser version and OS

## Code of Conduct

Be respectful. This is a learning project built during a hackathon. Constructive feedback is welcome; hostility is not.
