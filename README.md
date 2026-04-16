# NixWallet

A confidential browser wallet built on the **Fhenix network**, powered by **Fully Homomorphic Encryption (FHE)**.

NixWallet is a self-custodial Chrome extension wallet that allows users to manage encrypted tokens, send and receive assets, and interact with the Fhenix ecosystem — all from within the browser's side panel.

---

## Features

- **Chrome Side Panel** — Persistent wallet UI opens in the browser side panel (Chrome 114+)
- **Confidential Tokens** — Convert standard ERC-20 tokens into confidential FHERC20 variants (e.g., USDC becomes cUSDC) via an on-chain registry
- **FHERC20 Wrapper Registry** — Auto-deploys confidential wrappers for any ERC-20 token on first use; shared across all users
- **Batch Claim** — Claim multiple pending unshield requests in a single transaction
- **Send & Receive** — Transfer native ETH and ERC-20 tokens (public or confidential)
- **Multi-Account HD Wallet** — Derive accounts from a seed phrase or import private keys
- **Auto-Lock Timer** — Configurable inactivity timeout (5, 10, or 30 minutes) with background service worker integration
- **Unified Address Book** — Shared contacts between Settings and Send screens
- **Transaction History** — Enriched activity log with explorer links, confidential indicators, and recipient info
- **Password-Protected Secrets** — Mnemonic reveal requires password re-verification with auto-hide timer
- **Network** — Ethereum Sepolia testnet
- **In-Wallet Swaps** — *(Coming Soon)*
- **DApp Connection Manager** — *(Coming Soon)*
- **Multi-Network Support** — *(Coming Soon)* Fhenix mainnet, additional testnets
- **Token Logos** — *(Coming Soon)* Custom icons from token list APIs

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Build | Vite, CRXJS |
| Animations | Framer Motion |
| Crypto | Fhenix coFHE SDK, ethers.js v6 |
| Storage | Chrome local/session storage (AES-GCM encrypted vault) |
| Smart Contracts | Solidity 0.8.25, Hardhat, Fhenix Confidential Contracts |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Chrome 114+ (for side panel support)

### Installation

```bash
# Clone the repository
git clone https://github.com/AshThunder/nixwallet.git
cd nixwallet

# Install extension dependencies
cd extension
npm install

# Build the extension
npm run build
```

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `extension/dist` folder
5. Click the NixWallet icon in the toolbar — the wallet opens in a **side panel**

---

## Project Structure

```
nixwallet/
├── extension/              # Chrome extension (React + Vite)
│   ├── src/
│   │   ├── screens/        # UI screens (Dashboard, Settings, Send, etc.)
│   │   ├── lib/            # Wallet logic, crypto, contacts, activity, contracts
│   │   ├── components/     # Shared UI components
│   │   ├── App.tsx         # Main router + auto-lock listener
│   │   └── background.ts   # Service worker (auto-lock timer, RPC proxy)
│   ├── manifest.json       # Extension manifest (side panel, permissions)
│   └── dist/               # Built extension output
├── hardhat/                # Smart contract development
│   ├── contracts/
│   │   ├── FHERC20WrapperRegistry.sol    # Factory/registry for FHERC20 wrappers
│   │   └── fherc20/
│   │       └── FHERC20UnderlyingWrapper.sol  # FHERC20 wrapper for a single ERC-20
│   └── deploy/             # Deployment scripts
├── presentation/           # Project presentation slides
├── ARCHITECTURE.md         # Technical architecture documentation
├── SECURITY.md             # Security model and threat analysis
├── DEMO.md                 # Demo walkthrough guide
└── CONTRIBUTING.md         # Contribution guidelines
```

---

## Smart Contracts (Hardhat)

The Hardhat project contains two contracts:

- **`FHERC20WrapperRegistry`** — A factory contract that auto-deploys and indexes one confidential wrapper per underlying ERC-20 token (e.g., USDC gets a "Confidential USDC" / cUSDC wrapper). The first user to interact with a new token pays the deployment gas; all subsequent users share the same wrapper.
- **`FHERC20UnderlyingWrapper`** — The actual FHERC20 wrapper that extends Fhenix's `FHERC20ERC20Wrapper`, providing `shield`, `unshield`, `claimUnshielded`, `claimUnshieldedBatch`, and `confidentialTransfer` functionality.

```bash
cd hardhat
pnpm install
cp .env.example .env    # Add your deployer private key
npx hardhat compile
npx hardhat deploy --network sepolia --tags FHERC20
```

**Deployed Registry (Sepolia):** `0xEE098B005e1B979Ca32ac427c367C343879e502C`

---

## Links

- **GitHub**: [github.com/AshThunder/nixwallet](https://github.com/AshThunder/nixwallet)
- **Fhenix**: [fhenix.io](https://fhenix.io)
- **coFHE Docs**: [cofhe-docs.fhenix.zone](https://cofhe-docs.fhenix.zone)
- **Creator**: [@ChrisGold__](https://x.com/ChrisGold__)

---

## License

MIT
