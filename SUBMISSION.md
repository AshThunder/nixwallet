# Buildathon / public launch — quick reference

Fill in or confirm each item when you submit. This file is not required by the product; it is a checklist for you.

## Repository

- **GitHub:** https://github.com/AshThunder/nixwallet  
- **Default branch:** `main`  
- **Contracts:** `hardhat/` (Solidity + deploy scripts)

## Live site (presentation / privacy)

Replace with your deployed base URL (e.g. Vercel):

- **Landing:** `https://YOUR_HOST/` (maps to [presentation/index.html](presentation/index.html))
- **Walkthrough slides:** `https://YOUR_HOST/slides-journey.html`
- **Tech slides:** `https://YOUR_HOST/slides.html`
- **Privacy policy:** `https://YOUR_HOST/privacy.html` (or `/privacy` if you use a rewrite)

## Extension

- **Local setup:** [extension/LOCAL_SETUP.md](extension/LOCAL_SETUP.md)
- **Store listing copy:** [extension/STORE_LISTING.md](extension/STORE_LISTING.md)
- **Build:** `cd extension && npm install && npm run build` — load unpacked from `extension/dist`
- **Release zip:** `npm run package` (output is gitignored `*.zip`; upload to Chrome Web Store or attach to GitHub Releases)

## Demo video (if required)

- Show: install or open extension → onboarding or unlock → Sepolia balance → wrap or send → activity.
- Keep RPC/faucet steps short; mention testnet only.

## One-liner / tagline

Reuse the short description from STORE_LISTING or your100-character tagline; align with [README.md](README.md).

## Privacy & permissions (for forms)

- Data stays local; no wallet backend.
- **Permissions:** `storage`, `sidePanel`; broad **host** access for EIP-1193 injection and RPC proxying — justify on the form using [presentation/privacy.html](presentation/privacy.html) and STORE_LISTING.
