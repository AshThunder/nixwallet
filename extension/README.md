# NixWallet Chrome Extension

The Chrome extension frontend for NixWallet — a confidential wallet powered by Fhenix FHE.

**First-time local install (clone → build → Load unpacked):** see **[LOCAL_SETUP.md](./LOCAL_SETUP.md)**.

## Development

```bash
npm install
npm run dev      # Start Vite dev server with HMR
npm run build    # Production build to dist/
npm run package  # build + zip for Chrome Web Store
```

## Architecture

The extension is built with React 19, TypeScript, Tailwind CSS v4, and Vite. It runs as a Chrome Side Panel (Chrome 114+).

### Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main router, vault lifecycle, auto-lock listener |
| `src/background.ts` | Service worker: auto-lock timer, RPC proxy, side-panel dApp request opening, approval queue |
| `manifest.json` | Extension manifest (side panel, permissions, content scripts) |

### Screens (`src/screens/`)

| Screen | Description |
|--------|-------------|
| `Dashboard.tsx` | Token balances, activity feed, account picker, discover tab |
| `Send.tsx` | Public ETH/ERC-20 transfers and confidential FHERC20 transfers |
| `WrapUnwrap.tsx` | Shield/unshield tokens via FHERC20 wrappers, batch claim |
| `Receive.tsx` | QR code and address display |
| `ManageTokens.tsx` | Saved token list, Sepolia discovery (explorers + log fallback), tabs / filter / pagination |
| `Settings.tsx` | Security, address book, networks, about |
| `Onboarding.tsx` | Wallet creation and seed phrase backup |
| `Unlock.tsx` | Password entry for vault decryption |
| `Swap.tsx` | Swap MVP scaffold with token selectors, quote state, and explicit non-execution messaging |
| `Dapps.tsx` | Connected dApps, WalletConnect pairing/session controls, pending request context |
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
| `dappPermissions.ts` | Connected-origin permissions, active chain/account tracking, revoke support |
| `walletConnectWallet.ts` | WalletConnect v2 wallet-mode setup, session proposals, and session request handling |
| `walletMetadata.ts` | Shared NixWallet metadata for EIP-6963 and WalletConnect consistency |

## Loading in Chrome

1. Run `npm run build`
2. Open `chrome://extensions/` with Developer mode enabled
3. Click **Load unpacked** and select the `dist/` folder
4. Click the NixWallet icon — the wallet opens in the side panel

## DApp approval behavior

NixWallet injects an EIP-1193/EIP-6963 provider for external dApps. Sensitive requests are queued inside the extension and shown through the global approval overlay:

- `eth_requestAccounts`
- `personal_sign` / `eth_sign`
- `eth_signTypedData`, `eth_signTypedData_v3`, `eth_signTypedData_v4`
- `eth_sendTransaction`
- `wallet_switchEthereumChain`

The background service worker attempts to open the Chrome side panel as soon as a sensitive dApp RPC request arrives. Chrome can still refuse `sidePanel.open()` in some browser contexts, but the request remains queued and visible once NixWallet is opened.

Approvals require an unlocked wallet. While locked, requests can be displayed and rejected, but approval is blocked in both the UI and background message handler.

## Activity behavior

The Dashboard Activity tab records:

- transactions started inside NixWallet screens
- injected dApp `eth_sendTransaction` submissions
- WalletConnect `eth_sendTransaction` submissions

External activity rows currently capture account, network, recipient/contract, transaction hash, and source stage (`dapp-submitted` or `walletconnect-submitted`). Rich token-symbol/decimal decoding for external ERC-20 rows is planned.
