# Demo Guide

Step-by-step walkthrough for demonstrating NixWallet.

---

## Prerequisites

- Chrome browser
- The extension loaded from `extension/dist` (see [README](./README.md))
- A small amount of Sepolia ETH for transactions ([faucet](https://sepoliafaucet.com/))

---

## Demo Flow

### 1. Onboarding (Create Wallet)

- Open the extension popup
- Click **Create Wallet**
- Set a password
- Back up the 12-word seed phrase
- You'll land on the Dashboard

### 2. Dashboard Overview

- Show the **native balance** (ETH on Sepolia)
- Point out the **2×2 action grid**: Send, Wrap/Unwrap, Swap, Receive
- Switch between the **Tokens**, **Activity**, and **Discover** tabs

### 3. Receive Funds

- Click **Receive** → Show the QR code and address
- Copy the address and send Sepolia ETH from a faucet or another wallet

### 4. Send a Transaction

- Click **Send** → Select ETH or a token
- Enter a recipient address and amount
- Submit and show the **transaction confirmation**
- Click the **explorer link** → Opens Etherscan Sepolia

### 5. FHE Token Wrapping

- Click **Wrap/Unwrap**
- Select a token (e.g., USDC)
- Enter an amount to wrap → Tokens are encrypted on-chain via FHE
- Show the wrapped balance in the dashboard

### 6. Settings Tour

- Open **Settings** from the gear icon
- Walk through each category:
  - **Security & Privacy** → Auto-lock timer, secret phrase viewer, delete wallet
  - **Address Book** → Add a saved contact
  - **Networks** → Show Fhenix Nitrogen and Sepolia
  - **Connected DApps** → Show the "Coming Soon" overlay
  - **About** → Version, links

### 7. Swap (Coming Soon)

- Click **Swap** on the Dashboard
- Show the mock swap interface with the "Coming Soon" overlay
- Explain: "This will integrate a Fhenix DEX router for confidential token swaps"

### 8. Discover

- Switch to the **Discover** tab
- Show the ecosystem links: Fhenix, CoFHE Docs, Redact Money, CarrotBox

---

## Talking Points

- **Why a wallet?** — The entry point for every user. Privacy starts at the wallet level.
- **What's unique?** — Popular wallet offers don't offer support confidential tokens directly.
- **What's next?** — In-wallet swaps, DApp permissions manager, mainnet support.
