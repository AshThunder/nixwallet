# Security

## Threat Model

NixWallet handles private keys and seed phrases. The security model is designed to minimize exposure even if the user's browser is partially compromised.

### What We Protect

| Asset | Storage | Protection |
|-------|---------|------------|
| Seed phrase | `chrome.storage.local` | AES-GCM encrypted with password-derived key (PBKDF2) |
| Private keys | In-memory only | Derived on unlock, wiped on lock |
| Password | Never stored | Used to derive encryption key, then discarded |
| Address book | `chrome.storage.local` | Plaintext (no sensitive data) |
| Transaction history | `chrome.storage.local` | Plaintext (publicly visible on-chain anyway) |

### Key Security Features

- **AES-GCM Vault Encryption**: The seed phrase is never stored in plaintext. It is encrypted using a key derived from the user's password via PBKDF2 with a random salt.
- **Auto-Lock Timer**: The wallet automatically locks after a configurable period (5, 10, or 30 minutes), clearing all sensitive data from memory.
- **No External Calls for Key Material**: Private keys are derived locally using standard BIP-39/BIP-44 derivation. No key material is ever transmitted.
- **FHE for On-Chain Privacy**: Token balances wrapped using FHE are encrypted client-side before submission. Validators process encrypted data without access to plaintext values.

### What We Don't Protect Against

- **Malicious browser extensions** with full permissions can read `chrome.storage.local`
- **Physical device access** when the wallet is unlocked
- **Clipboard sniffing** if the user copies their seed phrase

### Responsible Disclosure

If you discover a vulnerability, please report it privately by reaching out to [@ChrisGold__](https://x.com/ChrisGold__) on X. Do not open a public issue.
