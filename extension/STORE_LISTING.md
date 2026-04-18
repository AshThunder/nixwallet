# Chrome Web Store Listing — NixWallet

Ready-to-paste copy and asset checklist for Chrome Web Store submission.

---

## Extension Name

NixWallet

## Short Description (132 characters max)

Confidential crypto wallet powered by Fhenix FHE. Shield ERC-20 tokens, send privately, and manage encrypted balances on-chain.

## Detailed Description

NixWallet is a self-custodial Chrome extension wallet that enables confidential token management through Fully Homomorphic Encryption (FHE), powered by the Fhenix coFHE network.

CONFIDENTIAL TOKENS
Wrap any ERC-20 token into a confidential FHERC20 variant (e.g., USDC becomes cUSDC). Balances are encrypted on-chain — only you can decrypt and view them.

SEND & RECEIVE
Transfer native ETH and ERC-20 tokens publicly, or send confidential transfers where the amount stays hidden on-chain.

FHERC20 WRAPPER REGISTRY
An on-chain factory contract auto-deploys a confidential wrapper the first time anyone wraps a new token. All subsequent users share the same wrapper — no setup needed.

BATCH CLAIM
Claim multiple pending unshield requests in a single transaction, saving gas and time.

MULTI-ACCOUNT HD WALLET
Generate accounts from a single seed phrase (BIP-44 derivation) or import external private keys. Switch between wallets instantly.

SECURITY
- AES-256-GCM encrypted vault with PBKDF2 key derivation (600,000 iterations)
- Configurable auto-lock timer (5, 10, or 30 minutes)
- Password-protected mnemonic reveal with auto-hide
- No external servers — all data stored locally in Chrome storage

SIDE PANEL EXPERIENCE
NixWallet opens in Chrome's side panel for a persistent, always-accessible wallet experience alongside your browsing.

DAPP PROVIDER
Injects an EIP-1193 compatible provider (window.ethereum) so decentralized applications can request accounts and send transactions through NixWallet.

OPEN SOURCE
NixWallet is fully open source. Review the code, report issues, and contribute:
https://github.com/AshThunder/nixwallet

Ships on Ethereum Sepolia today. The same Fhenix stack also targets Base testnet and Arbitrum testnet; switching between these in the extension is coming soon.

## Category

Productivity

## Language

English

## Single Purpose Description

(Required by Chrome Web Store for extensions requesting broad permissions)

NixWallet is a cryptocurrency wallet that allows users to manage encrypted tokens on the Fhenix network. It requires host permissions to inject an EIP-1193 provider into web pages so decentralized applications can interact with the wallet, and to proxy JSON-RPC requests to the Ethereum Sepolia network.

---

## Required Image Assets

| Asset | Dimensions | Required | Status |
|-------|-----------|----------|--------|
| Extension icon | 128x128 PNG | Yes | Done (`branding_icon128.png`) |
| Store icon | 128x128 PNG | Yes | Done (same file) |
| Screenshot 1 | 1280x800 or 640x400 | Yes (min 1, max 5) | TODO |
| Screenshot 2 | 1280x800 or 640x400 | Recommended | TODO |
| Screenshot 3 | 1280x800 or 640x400 | Recommended | TODO |
| Small promo tile | 440x280 PNG | Optional | TODO |
| Large promo tile | 1400x560 PNG | Optional | TODO |

### Recommended Screenshots

1. **Dashboard** — Side panel showing token balances (public + private split view)
2. **Wrap/Unwrap** — Shielding tokens into confidential FHERC20
3. **Send** — Public and confidential transfer modes
4. **Settings** — Security options, auto-lock, address book
5. **Onboarding** — Wallet creation / seed phrase screen

### Tips for Screenshots

- Capture the side panel in Chrome with a real webpage visible alongside it
- Use 1280x800 for best resolution on the store page
- Show real (testnet) balances rather than empty states
- Include the Chrome side panel header to make it clear this is a side panel extension

---

## Build & Upload

```bash
cd extension
npm run package
# Produces nixwallet-1.0.1.zip in the extension/ directory
# Upload this zip at https://chrome.google.com/webstore/devconsole
```

## Privacy Policy

A privacy policy URL is required during submission. Host a page that covers:
- What data is collected (none sent externally; all stored locally)
- Permissions justification (host_permissions for EIP-1193 provider injection and RPC proxying)
- No analytics, no tracking, no third-party data sharing
