# Security

## Threat Model

NixWallet handles private keys and seed phrases. The security model is designed to minimize exposure even if the user's browser is partially compromised.

### What We Protect

| Asset | Storage | Protection |
|-------|---------|------------|
| Seed phrase | `chrome.storage.local` | AES-GCM encrypted with password-derived key (PBKDF2, random salt) |
| Private keys | In-memory only | Derived on unlock, wiped on lock or auto-lock |
| Password | Never stored | Used to derive encryption key, then discarded |
| Session cache | `chrome.storage.session` | Decrypted vault cached for session auto-unlock; cleared on lock |
| Address book | `chrome.storage.local` | Plaintext (no sensitive data) |
| Saved custom tokens | `chrome.storage.local` | Plaintext (contract addresses and metadata only) |
| Transaction history | `chrome.storage.local` | Plaintext (publicly visible on-chain anyway) |

### Key Security Features

- **AES-GCM Vault Encryption**: The seed phrase is never stored in plaintext. It is encrypted using a key derived from the user's password via PBKDF2 with a random salt.

- **Auto-Lock Timer**: The wallet automatically locks after a configurable period of inactivity (5, 10, or 30 minutes). The background service worker compares idle time against the threshold and broadcasts `VAULT_LOCKED` when it expires. Idle time resets on extension messages (for example RPC traffic) and on **`KEEP_ALIVE`** pings from the UI, which are sent on common user interactions (click, keydown, scroll, input) so merely keeping the side panel open without interacting still counts as idle after the timeout.

- **Password-Protected Secret Reveal**: Viewing the mnemonic phrase in Settings requires re-entering the wallet password. The phrase auto-hides after 30 seconds to reduce exposure risk.

- **No External Calls for Key Material**: Private keys are derived locally using standard BIP-39/BIP-44 derivation. No key material is ever transmitted.

- **FHE for On-Chain Privacy**: Token balances wrapped using FHE are encrypted client-side before submission. Validators process encrypted data without access to plaintext values. Decryption uses the Fhenix Threshold Network with `decryptForView` (UI display) and `decryptForTx` (on-chain proofs).

- **Scoped Activity Clearing**: Transaction history can be cleared globally or per-network/address via the Settings Security panel.

### What We Don't Protect Against

- **Malicious browser extensions** with full permissions can read `chrome.storage.local`
- **Physical device access** when the wallet is unlocked (mitigated by auto-lock)
- **Clipboard sniffing** if the user copies their seed phrase (mitigated by auto-hide timer)
- **RPC endpoint compromise** — the extension trusts the configured RPC URL

### Responsible Disclosure

If you discover a vulnerability, please report it privately by reaching out to [@ChrisGold__](https://x.com/ChrisGold__) on X. Do not open a public issue.
