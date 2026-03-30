# Architecture

## Overview

NixWallet is a Chrome extension wallet designed around a **unidirectional data flow** and **encrypted-first** storage model. The architecture prioritizes security, minimal surface area, and fast renders within the constraints of a browser extension popup (360×600px).

```
┌─────────────────────────────────────────────────┐
│                   Chrome Extension               │
│                                                   │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐ │
│  │   App.tsx  │───▶│  Screens  │───▶│   Lib     │ │
│  │  (Router)  │    │  (Views)  │    │  (Logic)  │ │
│  └───────────┘    └───────────┘    └───────────┘ │
│        │                                │         │
│        ▼                                ▼         │
│  ┌───────────┐                   ┌───────────┐   │
│  │ background│                   │  chrome    │   │
│  │   .ts     │                   │  storage   │   │
│  └───────────┘                   └───────────┘   │
│                                         │         │
│                                         ▼         │
│                                  ┌───────────┐   │
│                                  │ AES-GCM   │   │
│                                  │ Encrypted  │   │
│                                  │ Vault      │   │
│                                  └───────────┘   │
└─────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐
│   Fhenix Network    │
│  ┌───────────────┐  │
│  │  coFHE SDK    │  │
│  │  (FHE Ops)    │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │  ethers.js    │  │
│  │  (RPC/Txns)   │  │
│  └───────────────┘  │
└─────────────────────┘
```

## Key Design Decisions

### 1. No External Servers
All wallet logic runs locally in the browser. Private keys, seed phrases, and preferences never leave the user's device. There is no backend, no API proxy, and no telemetry.

### 2. AES-GCM Encrypted Vault
The seed phrase and derived keys are encrypted using AES-GCM with a password-derived key (PBKDF2). The encrypted blob is stored in `chrome.storage.local`. On unlock, the vault is decrypted in memory and wiped on lock.

### 3. FHE Integration via coFHE SDK
Token wrapping and unwrapping use the Fhenix coFHE SDK to perform client-side encryption before submitting transactions. The encrypted ciphertext is sent on-chain where Fhenix validators can process it without decrypting.

### 4. Screen-Based Routing
Instead of a traditional SPA router (React Router), `App.tsx` uses a simple state machine (`screen` state) to switch between views. This eliminates router overhead and simplifies the extension's navigation model.

### 5. State Isolation
Each screen manages its own state. There is no global store (Redux, Zustand, etc.). Cross-screen data is passed via props from `App.tsx`. This keeps the architecture flat and easy to reason about.

## Data Flow

```
User Action
    │
    ▼
Screen Component (e.g. Send.tsx)
    │
    ├──▶ lib/wallet.ts  ──▶ ethers.js ──▶ Fhenix RPC
    ├──▶ lib/cofhe.ts   ──▶ coFHE SDK ──▶ FHE Encryption
    ├──▶ lib/vault.ts   ──▶ chrome.storage.local (encrypted)
    └──▶ lib/activity.ts ──▶ chrome.storage.local (plaintext)
```

## Directory Map

| Directory | Purpose |
|-----------|---------|
| `src/screens/` | UI screens — one file per screen |
| `src/lib/` | Business logic — wallet, vault, contacts, activity, crypto |
| `src/components/` | Shared UI components |
| `src/assets/` | Static images and icons |
| `public/` | Extension manifest assets |
