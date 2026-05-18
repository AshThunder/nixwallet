/**
 * Contract interaction helpers for FHERC20 ERC20 wrappers and native ETH wrapper.
 *
 * ERC-20: on-chain FHERC20WrapperRegistry auto-deploys one wrapper per token.
 * Native: FHERC20NativeWrapper (`shieldNative` / shared unshield flow) — see nativeToken.ts.
 */
import { ethers } from 'ethers';
import { getActiveNetwork, type NetworkId } from './wallet';
import {
  alignToWrapperRate,
  getNativeWrapperAddress,
  isNativeTokenAddress,
  WETH_ADDRESSES,
} from './nativeToken';

export { isNativeTokenAddress, isNativeWrapperConfigured, NATIVE_TOKEN_ADDRESS, NATIVE_TOKEN_METADATA } from './nativeToken';

// ABI for FHERC20 ERC20 wrapper contracts
export const WRAPPER_ABI = [
  'function shield(address to, uint256 amount) external returns (bytes32)',
  'function shieldNative(address to) external payable returns (bytes32)',
  'function shieldWrappedNative(address to, uint256 value) external returns (bytes32)',
  'function unshield(address from, address to, uint64 amount) external returns (bytes32)',
  'function claimUnshielded(bytes32 unshieldRequestId, uint64 unshieldAmountCleartext, bytes decryptionProof) external',
  'function claimUnshieldedBatch(bytes32[] unshieldRequestIds, uint64[] unshieldAmountCleartexts, bytes[] decryptionProofs) external',
  'function confidentialTransfer(address to, tuple(uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature) encryptedAmount) external returns (bytes32)',
  'function confidentialBalanceOf(address account) external view returns (bytes32)',
  'function getUserClaims(address user) external view returns ((address to, bytes32 ctHash, uint64 requestedAmount, uint64 decryptedAmount, bool claimed)[])',
  'function rate() external view returns (uint256)',
] as const;

export const REGISTRY_ABI = [
  'function getWrapper(address underlying) external view returns (address)',
  'function getOrCreateWrapper(address underlying) external returns (address)',
  'function wrapperCount() external view returns (uint256)',
] as const;

export const REGISTRY_ADDRESSES = {
  sepolia: '0xEE098B005e1B979Ca32ac427c367C343879e502C',
  baseSepolia: '0xfD4223809FE333FC23468F76bB38BE4169853761',
  arbitrumSepolia: '0xe572ED5b27b44641Da441cE479643B30CF200E9c',
} as const;

export function getRegistryAddress(): string {
  const network = getActiveNetwork();
  return REGISTRY_ADDRESSES[network.id] || ethers.ZeroAddress;
}

// In-memory cache so we don't re-query the registry for the same token
const _wrapperCache: Record<string, string> = {};

/** Read-only lookup: returns the wrapper address or null if none deployed yet */
export async function getWrapperAddress(provider: ethers.Provider, underlying: string): Promise<string | null> {
  if (isNativeTokenAddress(underlying)) {
    const network = getActiveNetwork();
    const addr = getNativeWrapperAddress(network.id);
    return addr === ethers.ZeroAddress ? null : addr;
  }

  const registryAddress = getRegistryAddress();
  if (registryAddress === ethers.ZeroAddress) return null;
  const key = underlying.toLowerCase();
  if (_wrapperCache[key]) return _wrapperCache[key];

  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
  const addr: string = await registry.getWrapper(key);
  if (addr === ethers.ZeroAddress) return null;

  _wrapperCache[key] = addr;
  return addr;
}

/** Native wrapper must be deployed separately (not via registry). */
export function getNativeWrapperAddressForNetwork(networkId: NetworkId = getActiveNetwork().id): string | null {
  const addr = getNativeWrapperAddress(networkId);
  return addr === ethers.ZeroAddress ? null : addr;
}

/** Deploy wrapper via registry if it doesn't exist yet, then return its address */
export async function getOrCreateWrapper(signer: ethers.Signer, underlying: string): Promise<string> {
  const registryAddress = getRegistryAddress();
  if (registryAddress === ethers.ZeroAddress) throw new Error('Registry not deployed on active network');
  const key = underlying.toLowerCase();
  if (_wrapperCache[key]) return _wrapperCache[key];

  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, signer);
  const tx = await registry.getOrCreateWrapper(key);
  await tx.wait();

  const wrapper = await registry.getWrapper(key);
  if (wrapper === ethers.ZeroAddress) throw new Error('Registry deploy failed');
  _wrapperCache[key] = wrapper;
  return wrapper;
}

/** Get a wrapper contract instance (read-only lookup, throws if no wrapper yet) */
export async function getWrapperContract(signerOrProvider: ethers.Signer | ethers.Provider, underlying: string): Promise<ethers.Contract> {
  const provider = 'getAddress' in signerOrProvider
    ? (signerOrProvider as ethers.Signer).provider!
    : signerOrProvider as ethers.Provider;
  const addr = await getWrapperAddress(provider, underlying);
  if (!addr) throw new Error(`No FHERC20 wrapper deployed for ${underlying}`);
  return new ethers.Contract(addr, WRAPPER_ABI, signerOrProvider);
}

/** Shield native ETH via FHERC20NativeWrapper.shieldNative (payable). */
export async function shieldNative(
  signer: ethers.Signer,
  to: string,
  amountWei: bigint,
  networkId: NetworkId = getActiveNetwork().id,
): Promise<ethers.ContractTransactionResponse> {
  const wrapperAddress = getNativeWrapperAddress(networkId);
  if (wrapperAddress === ethers.ZeroAddress) {
    throw new Error('Native ETH wrapper not deployed on this network. Run hardhat NativeWrapper deploy and set the address.');
  }

  const wrapper = new ethers.Contract(wrapperAddress, WRAPPER_ABI, signer);
  const rate = await wrapper.rate() as bigint;
  const aligned = alignToWrapperRate(amountWei, rate);
  if (aligned === 0n) {
    throw new Error('Amount too small after rate alignment. Try a slightly larger value.');
  }

  return wrapper.shieldNative(to, { value: aligned });
}

/** Shield WETH via approve + shieldWrappedNative. */
export async function shieldWrappedNative(
  signer: ethers.Signer,
  to: string,
  amountWei: bigint,
  networkId: NetworkId = getActiveNetwork().id,
): Promise<ethers.ContractTransactionResponse> {
  const wrapperAddress = getNativeWrapperAddress(networkId);
  if (wrapperAddress === ethers.ZeroAddress) {
    throw new Error('Native ETH wrapper not deployed on this network.');
  }
  const weth = WETH_ADDRESSES[networkId];
  if (!weth) throw new Error('WETH address not configured for this network.');

  const wrapper = new ethers.Contract(wrapperAddress, WRAPPER_ABI, signer);
  const rate = await wrapper.rate() as bigint;
  const aligned = alignToWrapperRate(amountWei, rate);
  if (aligned === 0n) throw new Error('Amount too small after rate alignment.');

  const wethContract = new ethers.Contract(
    weth,
    ['function approve(address spender, uint256 amount) external returns (bool)'],
    signer,
  );
  const approveTx = await wethContract.approve(wrapperAddress, aligned);
  await approveTx.wait();

  return wrapper.shieldWrappedNative(to, aligned);
}

/** Shield public ERC20 into confidential FHERC20 balance, auto-deploying the wrapper if needed */
export async function shieldTokens(signer: ethers.Signer, underlying: string, to: string, amount: bigint): Promise<ethers.ContractTransactionResponse> {
  if (isNativeTokenAddress(underlying)) {
    return shieldNative(signer, to, amount);
  }
  const wrapperAddress = await getOrCreateWrapper(signer, underlying);

  const token = new ethers.Contract(
    underlying,
    ['function approve(address spender, uint256 amount) external returns (bool)'],
    signer
  );
  const approveTx = await token.approve(wrapperAddress, amount);
  await approveTx.wait();

  const wrapper = new ethers.Contract(wrapperAddress, WRAPPER_ABI, signer);
  return wrapper.shield(to, amount);
}

/** Request unshield (step 1) */
export async function requestUnshield(
  signer: ethers.Signer,
  underlying: string,
  from: string,
  to: string,
  amount: bigint
): Promise<ethers.ContractTransactionResponse> {
  if (isNativeTokenAddress(underlying)) {
    const networkId = getActiveNetwork().id;
    const addr = getNativeWrapperAddress(networkId);
    if (addr === ethers.ZeroAddress) throw new Error('Native ETH wrapper not deployed on this network.');
    const wrapper = new ethers.Contract(addr, WRAPPER_ABI, signer);
    return wrapper.unshield(from, to, amount);
  }
  const wrapper = await getWrapperContract(signer, underlying);
  return wrapper.unshield(from, to, amount);
}

/** Claim unshield with decrypt proof (step 2) */
export async function claimUnshield(
  signer: ethers.Signer,
  underlying: string,
  requestId: string,
  decryptedValue: bigint,
  signature: string
): Promise<ethers.ContractTransactionResponse> {
  const wrapper = await getWrapperContract(signer, underlying);
  return wrapper.claimUnshielded(requestId, decryptedValue, signature);
}

/** Batch claim multiple unshield requests in a single transaction */
export async function batchClaimUnshield(
  signer: ethers.Signer,
  underlying: string,
  requestIds: string[],
  decryptedValues: bigint[],
  signatures: string[]
): Promise<ethers.ContractTransactionResponse> {
  const wrapper = await getWrapperContract(signer, underlying);
  return wrapper.claimUnshieldedBatch(requestIds, decryptedValues, signatures);
}

/** Confidential transfer to another address */
export async function confidentialTransfer(
  signer: ethers.Signer,
  underlying: string,
  to: string,
  encryptedAmount: unknown
): Promise<ethers.ContractTransactionResponse> {
  const wrapper = await getWrapperContract(signer, underlying);
  return wrapper.confidentialTransfer(to, encryptedAmount);
}

/** Get encrypted FHERC20 balance handle */
export async function getEncryptedBalance(provider: ethers.Provider, underlying: string, account: string): Promise<string> {
  const wrapper = await getWrapperContract(provider, underlying);
  return wrapper.confidentialBalanceOf(account);
}

/** Return all pending claims for user */
export async function getPendingClaims(provider: ethers.Provider, underlying: string, account: string): Promise<{ claimed: boolean; ctHash: string }[]> {
  const wrapper = await getWrapperContract(provider, underlying);
  const claims = await wrapper.getUserClaims(account);
  return claims.filter((c: { claimed: boolean }) => !c.claimed);
}
