# NixWallet Companion DApp

**Hosted:** [https://nixwalletdapp.vercel.app](https://nixwalletdapp.vercel.app)

This is an external dApp for testing public ERC-20, native ETH → cETH, and confidential FHERC20 flows with NixWallet as the only signer.

The dApp does not hold private keys and does not render trusted transaction approval UX. It initiates provider requests, then NixWallet shows the in-wallet confirmation modal.

## Setup

```bash
cd dapp
npm install
cp .env.example .env.local
npm run dev
```

Load or reload the local NixWallet extension build before testing. Sensitive dApp interactions should open NixWallet in the Chrome side panel when Chrome allows the side panel API call from the request path.

The registry addresses are also built into the dApp as fallbacks so local testing works even before `.env.local` is created.

## Current flows

- Discover NixWallet with EIP-6963 / injected provider fallback.
- Connect account with `eth_requestAccounts`.
- Show the detected wallet, connected account, active network, and chain ID in the wallet panel.
- Switch between Sepolia, Base Sepolia, and Arbitrum Sepolia.
- **Native ETH → cETH** on Sepolia, Base Sepolia, and Arbitrum Sepolia via `shieldNative` (pre-deployed wrapper addresses in `src/config/native.ts`).
- Select default Sepolia stablecoins that mirror the extension defaults:
  - USDT: `0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0`
  - USDC: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- Load ERC-20 metadata and public balance, with manual token address fallback.
- Transfer public USDT/USDC.
- Resolve or create FHERC20 wrapper through the registry.
- Approve wrapper spending.
- Wrap public ERC-20 into confidential balance with `shield`.
- Display encrypted balance handle and pending claim rows when available.
- Reveal confidential balance locally with CoFHE `decryptForView`.
- Generate encrypted amount input for confidential transfer.
- Show an in-progress state while CoFHE generates the encrypted payload.
- Keep generated encrypted payload fields read-only; users provide only recipient and amount in the normal flow.
- Request unshield/unwrap.
- Prepare CoFHE decrypt-for-tx proof for pending claims.
- Finalize a claim after proof preparation.
- Submit confidential transfer with generated encrypted amount tuple.

## CoFHE adapter note

The dApp initializes the browser CoFHE client with the NixWallet injected signer through the SDK's ethers v6 adapter. If CoFHE needs typed-data signatures, NixWallet handles those approvals in-wallet.

Generated encrypted transfer fields remain visible for transparency but are read-only. Claim proof fields are still visible for debugging/recovery while the claim flow is being hardened.

## NixWallet confirmation behavior

Every sensitive request should appear inside NixWallet:

- connect wallet
- network switch
- token approval
- wrapper creation
- wrap transaction
- unwrap request
- claim transaction
- confidential transfer transaction

The dApp status panel only says what it is waiting for.

Approval requires NixWallet to be unlocked. If the wallet is locked, the request can be visible in the side panel, but the Approve action remains unavailable until unlock.

## Activity tracking

Transactions submitted from this dApp are recorded in the NixWallet Activity tab after NixWallet sends them. External entries include account, network, recipient/contract, transaction hash, and dApp submission stage. The extension decodes verified ERC-20 transfers, wrapper shield/unwrap/confidential actions, and native cETH flows where possible (`extension/src/lib/txDecode.ts`).

## Known hardening items

- Track external dApp transactions from submitted to confirmed.
- Make the claim flow more guided when CoFHE proof availability allows it.
- Expand browser end-to-end tests with a freshly loaded extension build.
