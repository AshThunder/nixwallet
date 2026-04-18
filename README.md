# NixWallet

**Standard wallets don’t support confidential tokens — every balance and transfer is a billboard on a public chain.** 

Introducing **NixWallet**: a self-custodial Chrome extension wallet that wraps everyday ERC-20s into **FHERC20** confidential assets, sends **encrypted amounts** with Fhenix **coFHE**, and keeps the wallet one click away in the **side panel**.

Built for the **Fhenix** stack and **Fully Homomorphic Encryption (FHE)** — shield, run wallet logic against ciphertext, and unwrap back to public tokens when you choose.

**Demo video:** [YouTube — NixWallet walkthrough](https://youtu.be/QyfxLNSE_MQ)

---

## Why we built this

Normal wallets only move **plaintext** ERC-20s: the chain and any observer see how much moved where.

**Fhenix** adds **confidential compute**: contracts can operate on **encrypted** token amounts using FHE, so the ledger does not expose the same level of financial detail for wrapped assets. There was still a gap: a **browser wallet** that feels like a normal Ethereum wallet but can **shield**, **transfer confidentially**, and **unwrap** using the official **FHERC20** pattern and **coFHE** tooling.

NixWallet exists to make that workflow **self-custodial**, **local-first**, and **usable from Chrome** (side panel + optional `window.ethereum` for dApps) on **Ethereum Sepolia** today, with **Base testnet** and **Arbitrum testnet** next for in-wallet multi-network support (there is no separate “Fhenix mainnet” — those three are the relevant environments).

---

## How we built it

| Piece | What it does |
|-------|----------------|
| **Extension (React + Vite + CRXJS)** | Side panel UI, onboarding, vault unlock, send/receive, wrap/unwrap, settings. No standalone backend. |
| **Encrypted vault** | Seed / imported keys stored in `chrome.storage.local` as **AES-GCM** ciphertext; key from **PBKDF2** + password. Keys live in memory only while unlocked. |
| **Background service worker** | Auto-lock timer, `KEEP_ALIVE` on user activity, and a small **JSON-RPC proxy** for dApp-related `eth_*` calls. |
| **coFHE SDK (`@cofhe/sdk`)** | Client-side **encrypt** (e.g. amounts as encrypted inputs), **decryptForView** (show balances in UI), **decryptForTx** (threshold proofs for claims and txs). |
| **ethers.js** | Sepolia RPC, contract calls, signing. |
| **Solidity (Hardhat)** | **`FHERC20WrapperRegistry`** — factory/registry for one confidential wrapper per underlying ERC-20. **`FHERC20UnderlyingWrapper`** — concrete wrapper (`shield`, `unshield`, `claimUnshielded`, `claimUnshieldedBatch`, `confidentialTransfer`, etc.). |

Deep dives: **[ARCHITECTURE.md](./ARCHITECTURE.md)** (data flow, design choices) and **[SECURITY.md](./SECURITY.md)** (threat model, storage).

---

## What is encrypted — and what is still public

**On-chain (FHERC20 / FHE layer)**  
- **Confidential balances and confidential transfer amounts** are represented as **encrypted** values on the contract side; observers do not see plaintext token amounts in the same way as standard ERC-20 `Transfer` events for the confidential leg.  
- **Addresses** involved in transactions are still visible on L1 like any EVM tx (from/to, contract addresses, calldata shape). Privacy is **not** “fully anonymous” — it is **amount / balance confidentiality** for the FHERC20 flows, as enforced by the Fhenix stack.  
- **Public** ETH and **standard** ERC-20 transfers behave like normal Ethereum: visible amounts and logs.

**In the browser**  
- **Mnemonic / vault payload**: encrypted at rest (see SECURITY.md).  
- **Private keys**: decrypted in memory for signing; cleared on lock.  
- **Password**: not stored; used only to derive the vault key.  
- **Address book, activity labels, settings**: stored locally; not E2E encrypted (treat as sensitive if device is shared).

---

## How the confidential logic works (high level)

Think in **three pillars**: **wrap (shield)**, **confidential use**, **unwrap (unshield + claim)**.

### 1. Shield (public ERC-20 → confidential FHERC20)

1. User picks an underlying ERC-20 (e.g. USDC).  
2. The app resolves or deploys a **wrapper** via **`FHERC20WrapperRegistry`**.  
3. User **approves** the wrapper, then **`shield`** locks underlying tokens and credits **encrypted** balance on the FHERC20.  
4. On-chain naming follows **Confidential \<name\>** / **`c` + symbol** (e.g. cUSDC).

### 2. Confidential transfer

1. The wallet **encrypts** the amount with coFHE (client-side).  
2. It calls **`confidentialTransfer`** on the wrapper with the encrypted input; the chain handles FHE-validated updates without revealing the amount in plaintext on the public ERC-20 event model.

### 3. Unshield and claim

1. **`unshield`** starts a **time-gated / threshold** unshield flow (request on-chain).  
2. The wallet uses **`decryptForTx`** (and retries as needed) to obtain values/proofs the contract accepts.  
3. **`claimUnshielded`** (or **`claimUnshieldedBatch`** for many pending claims) releases underlying ERC-20 back to the user.  
4. **`decryptForView`** is used when you **reveal** a confidential balance in the UI — display-only, separate from tx proofs.

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
- **Multi-Network Support** — *(Coming Soon)* Base testnet and Arbitrum testnet support

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

**Detailed local setup** (troubleshooting, optional env, dev workflow): **[extension/LOCAL_SETUP.md](extension/LOCAL_SETUP.md)**.

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
- **Website**: [NixWallet](https://nixwallet.vercel.app/)

---

## License

MIT
