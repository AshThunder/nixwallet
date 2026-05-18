# Native ETH wrap / unwrap (FHERC20NativeWrapper)

Implements [FHERC20 Wrappers — Native](https://cofhe-docs.fhenix.zone/fhe-library/confidential-contracts/fherc20/fherc20-wrapper) in NixWallet.

**Imports:** CoFHE docs use `@fhenixprotocol/confidential-contracts/...`; Hardhat installs the same library as npm package `fhenix-confidential-contracts` (v0.3.1). Use that path in Solidity — not a different contract set.

## Flow

| Action | On-chain |
|--------|----------|
| **Wrap** | `shieldNative(to)` with `msg.value` (ETH → cETH) |
| **Unshield** | `unshield` → `decryptForTx` → `claimUnshielded` (receives native ETH) |

ERC-20 tokens continue to use the **registry** + `shield(to, amount)`. Native ETH uses a **single deployed** `FHERC20NativeUnderlyingWrapper` per network (not registry-created).

## Deploy native wrapper

```bash
cd hardhat
npm run deploy:native                    # Sepolia (default in script)
# or:
npx hardhat deploy --tags NativeWrapper --network baseSepolia
npx hardhat deploy --tags NativeWrapper --network arbitrumSepolia
```

**Deployed wrappers (configured in `extension/src/lib/nativeToken.ts`):**

| Network | Address |
|---------|---------|
| Ethereum Sepolia | `0x55Ee31F5706D91e0E48C48B5dBc6e14aD7afA3d2` |
| Base Sepolia | `0xCC5935e2D653a8e32151e8cB342795485BEbdF50` |
| Arbitrum Sepolia | `0x9323c32a9759A5F5dF4340e8309Fb639da8c5a29` |

```bash
npm run deploy:native        # Sepolia
npm run deploy:native:base   # Base Sepolia
npm run deploy:native:arb    # Arbitrum Sepolia
```

For other networks, copy the logged address into `NATIVE_WRAPPER_ADDRESSES` after deploy.

Or set at build time:

```bash
VITE_NATIVE_WRAPPER_SEPOLIA=0x...
```

## UI

- **Wrap/Unwrap** token list includes **ETH** (native).
- **Dashboard** → ETH row and wrap token picker open Wrap/Unwrap with native selected.
- Until a wrapper address is configured, a yellow banner explains deploy steps.

## Optional: WETH path

`shieldWrappedNative(to, value)` is available in `contracts.ts` as `shieldWrappedNative()` for WETH holders; the main UI uses direct `shieldNative` for ETH.

## Rate / dust

Native wrapper uses `rate()` (typically `1e12` for 18-decimal ETH → 6-decimal cETH). The client aligns `msg.value` to a multiple of `rate()` before `shieldNative`; the contract refunds dust below `rate()`.
