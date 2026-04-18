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

**Deployed on Sepolia:** `0xEE098B005e1B979Ca32ac427c367C343879e502C`

### FHERC20UnderlyingWrapper

**Location:** `contracts/fherc20/FHERC20UnderlyingWrapper.sol`

Extends Fhenix's `FHERC20ERC20Wrapper` to provide confidential token functionality for a single underlying ERC-20:

- `shield(to, amount)` — Deposit ERC-20 tokens and mint confidential FHERC20 balance
- `unshield(from, to, amount)` — Burn confidential tokens and create a claim
- `claimUnshielded(requestId, cleartext, proof)` — Claim underlying tokens with decryption proof
- `claimUnshieldedBatch(ids[], cleartexts[], proofs[])` — Batch claim multiple unshields
- `confidentialTransfer(to, encryptedAmount)` — Transfer encrypted tokens
- `confidentialBalanceOf(account)` — Get encrypted balance handle

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
npx hardhat test                             # Run tests
```

## Configuration

See `hardhat.config.ts` for network configuration. The project targets Ethereum Sepolia for testnet deployment.

## Dependencies

- `@fhenixprotocol/confidential-contracts` — FHERC20 base contracts
- `@openzeppelin/contracts` — ERC-20 interfaces
- `hardhat-deploy` — Deployment management
