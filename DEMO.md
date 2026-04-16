# Demo Guide

Step-by-step walkthrough for demonstrating NixWallet.

---

## Prerequisites

- Chrome browser (114+ for side panel support)
- The extension loaded from `extension/dist` (see [README](./README.md))
- A small amount of Sepolia ETH for transactions ([faucet](https://sepoliafaucet.com/))

---

## Demo Flow

### 1. Onboarding (Create Wallet)

- Click the NixWallet icon in the Chrome toolbar — the **side panel** opens
- Click **Create Wallet**
- Set a password
- Back up the 12-word seed phrase
- You'll land on the Dashboard

### 2. Dashboard Overview

- Show the **native ETH balance** on Sepolia
- Point out the **2x2 action grid**: Send, Wrap/Unwrap, Swap, Receive
- Switch between the **Tokens**, **Activity**, and **Discover** tabs
- Note the persistent side panel — stays open while navigating other sites

### 3. Receive Funds

- Click **Receive** to show the QR code and address
- Copy the address and send Sepolia ETH from a faucet or another wallet

### 4. Send a Transaction

- Click **Send** and select ETH or a token
- Enter a recipient address and amount
- Submit and show the **transaction confirmation**
- Click the **explorer link** on the activity entry to open Etherscan Sepolia

### 5. Confidential Token Wrapping

- Click **Wrap/Unwrap**
- Select a token (e.g., USDC on Sepolia)
- Enter an amount to wrap — tokens are encrypted on-chain via FHE, creating a confidential token (e.g., cUSDC)
- Show the confidential balance on the Dashboard by clicking **Reveal Balance**

### 6. Batch Claiming (Unwrap)

- In **Wrap/Unwrap**, switch to Unwrap mode
- If there are pending unshield claims (from previous unwraps), a **"Claim All Pending"** banner appears
- Click it to batch-claim all pending unshields in a single transaction
- Show the progress: "Decrypting claim 1/3..." then "Submitting batch claim..."

### 7. Settings Tour

- Open **Settings** from the gear icon
- Walk through each category:
  - **Security & Privacy** — Auto-lock timer, password-protected mnemonic viewer (enter password to reveal, auto-hides after 30s), clear transaction history, delete wallet
  - **Address Book** — Add/remove contacts (shared with Send screen)
  - **Networks** — Show Sepolia (active) and future networks marked "Soon"
  - **Connected DApps** — Coming Soon overlay
  - **About** — Version, links

### 8. Auto-Lock Demo

- Set the auto-lock timer to **5 minutes** in Settings > Security
- Leave the wallet idle
- After 5 minutes, the wallet automatically locks and shows the unlock screen

### 9. Swap (Coming Soon)

- Click **Swap** on the Dashboard
- Show the "Coming Soon" overlay
- Explain: "This will integrate a Fhenix DEX router for confidential token swaps"

### 10. Discover

- Switch to the **Discover** tab
- Show the ecosystem links: Fhenix, CoFHE Docs, Redact Money, CarrotBox

---

## Talking Points

- **Why a wallet?** — The entry point for every user. Privacy starts at the wallet level.
- **What's unique?** — Standard wallets don't support confidential tokens. NixWallet integrates FHE natively, turning any ERC-20 into a confidential token (e.g., USDC to cUSDC).
- **Registry pattern** — Any ERC-20 can be wrapped into a confidential variant. First user deploys the wrapper; everyone else shares it.
- **What's next?** — In-wallet swaps, dApp permissions manager, multi-network support, token logos.
