# NixWallet Chrome Extension

The Chrome extension frontend for NixWallet — a confidential wallet powered by Fhenix FHE.

**First-time local install (clone → build → Load unpacked):** see **[LOCAL_SETUP.md](./LOCAL_SETUP.md)**.

## Development

```bash
npm install
npm run dev      # Start Vite dev server with HMR
npm run build    # Production build to dist/
npm run package  # build + zip for Chrome Web Store (see STORE_LISTING.md)
```

## Architecture

The extension is built with React 19, TypeScript, Tailwind CSS v4, and Vite. It runs as a Chrome Side Panel (Chrome 114+).

### Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main router, vault lifecycle, auto-lock listener |
| `src/background.ts` | Service worker: auto-lock timer, RPC proxy, `KEEP_ALIVE` |
| `manifest.json` | Extension manifest (side panel, permissions, content scripts) |

### Screens (`src/screens/`)

| Screen | Description |
|--------|-------------|
| `Dashboard.tsx` | Token balances, activity feed, account picker |
| `Send.tsx` | Public ETH/ERC-20 transfers and confidential FHERC20 transfers |
| `WrapUnwrap.tsx` | Shield/unshield tokens via FHERC20 wrappers, batch claim |
| `Receive.tsx` | QR code and address display |
| `ManageTokens.tsx` | Saved token list, Sepolia discovery (explorers + log fallback), tabs / filter / pagination |
| `Settings.tsx` | Security, address book, networks, about |
| `Onboarding.tsx` | Wallet creation and seed phrase backup |
| `Unlock.tsx` | Password entry for vault decryption |
| `Swap.tsx` | Coming Soon placeholder |
| `Dapps.tsx` | Coming Soon placeholder |
| `Discover.tsx` | Ecosystem links |

### Libraries (`src/lib/`)

| Module | Purpose |
|--------|---------|
| `vault.ts` | AES-GCM vault encryption, session cache |
| `wallet.ts` | HD derivation, signer creation, network config |
| `cofhe.ts` | coFHE SDK wrapper (encrypt, decryptForView, decryptForTx) |
| `contracts.ts` | FHERC20 registry + wrapper interaction helpers |
| `contacts.ts` | Unified address book (shared by Send + Settings) |
| `activity.ts` | Transaction history storage and retrieval |
| `tokens.ts` | Persisted custom ERC-20 list helpers |
| `detectTokens.ts` | Suggested tokens on Sepolia (Etherscan, Blockscout, `getLogs`, balance probes) |

## Loading in Chrome

1. Run `npm run build`
2. Open `chrome://extensions/` with Developer mode enabled
3. Click **Load unpacked** and select the `dist/` folder
4. Click the NixWallet icon — the wallet opens in the side panel
