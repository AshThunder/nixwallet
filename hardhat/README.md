# NixWallet Smart Contracts

Solidity contracts for NixWallet's confidential token infrastructure, built with Hardhat and Fhenix Confidential Contracts.

This directory lives in the **same Git repository** as the Chrome extension (`../extension/`). It is normal source — not a submodule — so contracts and deploy scripts stay versioned with the app.

## Contracts

### FHERC20WrapperRegistry

**Location:** `contracts/FHERC20WrapperRegistry.sol`

A factory contract that auto-deploys and indexes one confidential FHERC20 wrapper per underlying ERC-20 token. Wrappers are named with the "Confidential" prefix and "c" symbol prefix (e.g., USDC becomes "Confidential USD Coin" / cUSDC). The first caller to interact with a new token pays the deployment gas; all subsequent users share the same wrapper.

**Key functions:**
- `getOrCreateWrapper(address underlying)` — Returns the wrapper address, deploying a new one if none exists
- `getWrapper(address underlying)` — Read-only lookup (returns `address(0)` if no wrapper)
- `wrapperCount()` — Total number of deployed wrappers

**Deployed registries:**

- Ethereum Sepolia: `0xEE098B005e1B979Ca32ac427c367C343879e502C`
- Base Sepolia: `0xfD4223809FE333FC23468F76bB38BE4169853761`
- Arbitrum Sepolia: `0xe572ED5b27b44641Da441cE479643B30CF200E9c`

### FHERC20UnderlyingWrapper

**Location:** `contracts/fherc20/FHERC20UnderlyingWrapper.sol`

Extends Fhenix's `FHERC20ERC20Wrapper` to provide confidential token functionality for a single underlying ERC-20:

- `shield(to, amount)` — Deposit ERC-20 tokens and mint confidential FHERC20 balance
- `unshield(from, to, amount)` — Burn confidential tokens and create a claim
- `claimUnshielded(requestId, cleartext, proof)` — Claim underlying tokens with decryption proof
- `claimUnshieldedBatch(ids[], cleartexts[], proofs[])` — Batch claim multiple unshields
- `confidentialTransfer(to, encryptedAmount)` — Transfer encrypted tokens
- `confidentialBalanceOf(account)` — Get encrypted balance handle

### FHERC20NativeUnderlyingWrapper

**Location:** `contracts/fherc20/FHERC20NativeUnderlyingWrapper.sol`

Extends Fhenix's [`FHERC20NativeWrapper`](https://cofhe-docs.fhenix.zone/fhe-library/confidential-contracts/fherc20/fherc20-wrapper) for **native ETH** (and WETH via `shieldWrappedNative`). Deploy **once per network** — not via the registry.

- `shieldNative(to)` — Payable; shields `msg.value` ETH into cETH
- `shieldWrappedNative(to, value)` — Shield WETH (approve first)
- `unshield` / `claimUnshielded` / `claimUnshieldedBatch` — Same flow as ERC-20 wrappers; claim pays out **native ETH**

```bash
npm run deploy:native
# or: npx hardhat deploy --tags NativeWrapper --network sepolia
```

**Deployed:**

| Network | Address |
|---------|---------|
| Sepolia | `0x55Ee31F5706D91e0E48C48B5dBc6e14aD7afA3d2` |
| Base Sepolia | `0xCC5935e2D653a8e32151e8cB342795485BEbdF50` |
| Arbitrum Sepolia | `0x9323c32a9759A5F5dF4340e8309Fb639da8c5a29` |

Paste into `extension/src/lib/nativeToken.ts` or `VITE_NATIVE_WRAPPER_*` env vars. See `extension/NATIVE_WRAP.md`.

### Decimal Normalization

Wrappers normalize token decimals to fit within `euint64`. The maximum confidential decimals default to 6:
- For an ERC-20 with 18 decimals: `rate() = 10^12`
- Shielding `1e18` underlying tokens produces `1e6` confidential tokens (e.g., 1.0 cUSDC with 6 decimals)

## Setup

```bash
pnpm install
cp .env.example .env    # Add DEPLOYER_PRIVATE_KEY
```

## Commands

```bash
npx hardhat compile                          # Compile contracts
npx hardhat deploy --network sepolia --tags FHERC20   # Deploy registry
npx hardhat deploy --network baseSepolia --tags FHERC20
npx hardhat deploy --network arbitrumSepolia --tags FHERC20
npx hardhat test                             # Run tests
```

## Configuration

See `hardhat.config.ts` for network configuration. The project targets Ethereum Sepolia, Base Sepolia, and Arbitrum Sepolia for testnet deployment.

## Dependencies

- `@fhenixprotocol/confidential-contracts` — FHERC20 base contracts
- `@openzeppelin/contracts` — ERC-20 interfaces
- `hardhat-deploy` — Deployment management
