# Architecture

## Overview

NixWallet is a Chrome extension wallet designed around a **unidirectional data flow** and **encrypted-first** storage model. The architecture prioritizes security, minimal surface area, and responsive UI within the Chrome Side Panel.

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome Extension                       │
│                                                           │
│  ┌──────────────┐   ┌──────────┐   ┌──────────────────┐ │
│  │   App.tsx     │──▶│ Screens  │──▶│  lib/ (Logic)    │ │
│  │ (Router +     │   │ (Views)  │   │                  │ │
│  │  Lock Mgr)    │   │          │   │ wallet, vault,   │ │
│  └──────────────┘   └──────────┘   │ cofhe, contracts, │ │
│        ▲                            │ contacts, activity│ │
│        │  VAULT_LOCKED              └──────────────────┘ │
│        │  VAULT_UNLOCKED                    │            │
│  ┌──────────────┐                   ┌──────────────┐    │
│  │ background.ts │                  │ chrome.storage│    │
│  │ (Auto-Lock    │                  │ (local +      │    │
│  │  + RPC Proxy) │                  │  session)     │    │
│  └──────────────┘                   └──────────────┘    │
│                                            │             │
│                                     ┌──────────────┐    │
│                                     │ AES-GCM      │    │
│                                     │ Encrypted    │    │
│                                     │ Vault        │    │
│                                     └──────────────┘    │
└──────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────┐
│         Ethereum Sepolia             │
│  ┌──────────────────────────────┐   │
│  │  FHERC20WrapperRegistry      │   │
│  │  (Factory: auto-deploy       │   │
│  │   wrappers per ERC-20)       │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │  FHERC20UnderlyingWrapper(s) │   │
│  │  (shield / unshield / claim  │   │
│  │   / claimBatch / transfer)   │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │  coFHE SDK (FHE encryption   │   │
│  │  + Threshold decryption)     │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘
```

## Key Design Decisions

### 1. Chrome Side Panel
The wallet opens in a persistent side panel (Chrome 114+) rather than a temporary popup. This allows the UI to remain open while navigating dApps. The manifest uses `side_panel.default_path` and `chrome.sidePanel.setPanelBehavior` to open on icon click.

### 2. No External Servers
All wallet logic runs locally in the browser. Private keys, seed phrases, and preferences never leave the user's device. There is no backend, no API proxy, and no telemetry.

### 3. AES-GCM Encrypted Vault
The seed phrase and imported keys are encrypted using AES-GCM with a password-derived key (PBKDF2, random salt). The encrypted blob lives in `chrome.storage.local`. On unlock, it's decrypted into memory; on lock, sensitive data is wiped.

### 4. Auto-Lock Flow
The background service worker (`background.ts`) and the UI (`App.tsx`) communicate via Chrome messaging:

1. On successful unlock, `App.tsx` sends `VAULT_UNLOCKED` to background
2. Background starts a 30-second polling interval comparing `Date.now() - lastActivity` against `autoLockTimeout`
3. Incoming runtime messages (`RPC_REQUEST`, `KEEP_ALIVE`, lock state, etc.) reset `lastActivity`; the UI also sends `KEEP_ALIVE` on common user events (click, keydown, scroll, input) so the timer reflects real interaction with the side panel
4. When the threshold is exceeded, background broadcasts `VAULT_LOCKED`
5. `App.tsx` listens for `VAULT_LOCKED`, clears memory, and transitions to the unlock screen

### 5. FHERC20 Wrapper Registry
Instead of hardcoding wrapper addresses per token, the extension uses an on-chain `FHERC20WrapperRegistry` factory contract:

- `getWrapper(underlying)` — read-only lookup (returns `address(0)` if none deployed)
- `getOrCreateWrapper(underlying)` — deploys a new wrapper on-the-fly if none exists

The registry names wrappers with the "Confidential" prefix and "c" symbol prefix (e.g., USDC becomes "Confidential USD Coin" / cUSDC). The first user to wrap a given ERC-20 pays the deployment gas. All subsequent users discover and share the same wrapper via the registry. This is analogous to Uniswap's pair factory pattern.

### 6. Batch Claiming
The FHERC20 wrapper supports `claimUnshieldedBatch` for claiming multiple pending unshield requests in a single transaction. The extension's WrapUnwrap screen detects orphaned claims and offers a "Claim All Pending" action that:
1. Iterates pending claims and decrypts each via `decryptForTx`
2. Submits all results in a single `claimUnshieldedBatch` call

### 7. Screen-Based Routing
`App.tsx` uses a simple state machine (`screen` state) to switch between views, avoiding router overhead and simplifying the extension's navigation model.

### 8. State Isolation
Each screen manages its own state. There is no global store. Cross-screen data is passed via props from `App.tsx`. This keeps the architecture flat and easy to reason about.

### 9. Smart Contracts in the Main Repository
Solidity sources and Hardhat configuration live under **`hardhat/`** in the same Git repo as the extension (not a separate submodule). Deploy artifacts and `node_modules` remain gitignored; see `hardhat/README.md` for compile and deploy commands.

### 10. Token Discovery (Manage Tokens)
On **Sepolia**, **ManageTokens** suggests ERC-20s the user may hold but has not saved yet:

- Merges contract addresses from **Etherscan** and **Blockscout** token-transfer indexers (optional `VITE_ETHERSCAN_API_KEY` at build time for Etherscan reliability)
- Falls back to a bounded **`eth_getLogs`** scan for recent inbound `Transfer` events when both indexers fail
- Always **balance-probes** a small curated list of common Sepolia ERC-20s
- **Does not** re-run full discovery on every “Add”; it updates the list locally after add and only rescans after **remove** or wallet/network change

The screen uses **tabs** (In your wallet vs Saved), **filter** (name / symbol / address), and **pagination** to keep long lists usable.

## Data Flow

```
User Action
    │
    ▼
Screen Component (e.g. Send.tsx)
    │
    ├──▶ lib/wallet.ts    ──▶ ethers.js  ──▶ Sepolia RPC
    ├──▶ lib/cofhe.ts     ──▶ coFHE SDK  ──▶ FHE Encryption / Threshold Decrypt
    ├──▶ lib/contracts.ts    ──▶ Registry   ──▶ Wrapper lookup / deploy / interact
    ├──▶ lib/tokens.ts       ──▶ chrome.storage.local (custom token list)
    ├──▶ lib/detectTokens.ts ──▶ RPC + explorers ──▶ Suggested tokens (Sepolia)
    ├──▶ lib/vault.ts        ──▶ chrome.storage.local (AES-GCM encrypted)
    ├──▶ lib/contacts.ts     ──▶ chrome.storage.local (unified address book)
    └──▶ lib/activity.ts     ──▶ chrome.storage.local (transaction history)
```

## Directory Map

| Directory | Purpose |
|-----------|---------|
| `extension/src/screens/` | UI screens — one file per screen |
| `extension/src/lib/` | Business logic — wallet, vault, contacts, activity, contracts, cofhe, tokens, detectTokens |
| `extension/src/components/` | Shared UI (e.g. `AccountPicker`) |
| `extension/src/background.ts` | Service worker — auto-lock timer, RPC proxy |
| `extension/manifest.json` | Extension manifest (side panel, permissions, content scripts) |
| `hardhat/contracts/` | Solidity contracts (Registry + Wrapper) |
| `hardhat/deploy/` | Hardhat deployment scripts |
