# NixWallet

A confidential browser wallet built on the **Fhenix network**, powered by **Fully Homomorphic Encryption (FHE)**.

NixWallet is a self-custodial wallet that allows users to manage encrypted tokens, send and receive assets, and interact with the Fhenix ecosystem — all from within the browser.

---

## Features

- **FHE Token Wrapping** — Convert standard ERC-20 tokens into encrypted variants with one click
- **Send & Receive** — Transfer native and ERC-20 tokens
- **Multi-Account HD Wallet** — Derive accounts from a seed phrase or import private keys
- **Multi-Network Support** — Fhenix Nitrogen, Ethereum Sepolia, and more
- **Address Book** — Save frequently used addresses locally
- **dApp Discovery** — Browse Fhenix ecosystem apps from within the wallet
- **Categorized Settings** — Security, Networks, Address Book, Connected DApps, About
- **In-Wallet Swaps** — *(Coming Soon)* Swap tokens directly inside the wallet
- **DApp Connection Manager** — *(Coming Soon)* View and revoke connected site permissions

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Build | Vite, CRXJS |
| Animations | Framer Motion |
| Crypto | Fhenix coFHE SDK, fhenixjs, ethers.js v6 |
| Storage | Chrome local storage (AES-GCM encrypted vault) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

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

---

## Project Structure

```
nixwallet/
├── extension/          # Chrome extension (React + Vite)
│   ├── src/
│   │   ├── screens/    # UI screens (Dashboard, Settings, Send, etc.)
│   │   ├── lib/        # Wallet logic, crypto, contacts, activity
│   │   └── App.tsx     # Main router
│   ├── public/         # Static assets and branding icons
│   └── manifest.json   # Extension manifest
├── hardhat/            # Smart contract development
│   ├── contracts/      # Solidity contracts
│   └── deploy/         # Deployment scripts
└── presentation/       # Project presentation slides
```

---

## Smart Contracts (Hardhat)

```bash
cd hardhat
npm install
cp .env.example .env    # Add your deployer private key
npx hardhat compile
npx hardhat deploy --network <network>
```

---

## Links

- **GitHub**: [github.com/AshThunder/nixwallet](https://github.com/AshThunder/nixwallet)
- **Fhenix**: [fhenix.io](https://fhenix.io)
- **Creator**: [@ChrisGold__](https://x.com/ChrisGold__)

---

## License

MIT
