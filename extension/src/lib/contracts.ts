/**
 * Contract interaction helpers for FHERC20 ERC20 wrappers.
 *
 * Uses an on-chain FHERC20WrapperRegistry that auto-deploys one wrapper
 * per underlying ERC-20 the first time anyone interacts with it.
 */
import { ethers } from 'ethers';

// ABI for FHERC20 ERC20 wrapper contracts
export const WRAPPER_ABI = [
  'function shield(address to, uint256 amount) external returns (bytes32)',
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

// Set after deploying FHERC20WrapperRegistry to Sepolia
export const REGISTRY_ADDRESS = '0xEE098B005e1B979Ca32ac427c367C343879e502C';

// In-memory cache so we don't re-query the registry for the same token
const _wrapperCache: Record<string, string> = {};

/** Read-only lookup: returns the wrapper address or null if none deployed yet */
export async function getWrapperAddress(provider: ethers.Provider, underlying: string): Promise<string | null> {
  const key = underlying.toLowerCase();
  if (_wrapperCache[key]) return _wrapperCache[key];

  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
  const addr: string = await registry.getWrapper(key);
  if (addr === ethers.ZeroAddress) return null;

  _wrapperCache[key] = addr;
  return addr;
}

/** Deploy wrapper via registry if it doesn't exist yet, then return its address */
export async function getOrCreateWrapper(signer: ethers.Signer, underlying: string): Promise<string> {
  const key = underlying.toLowerCase();
  if (_wrapperCache[key]) return _wrapperCache[key];

  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
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

/** Shield public ERC20 into confidential FHERC20 balance, auto-deploying the wrapper if needed */
export async function shieldTokens(signer: ethers.Signer, underlying: string, to: string, amount: bigint): Promise<ethers.ContractTransactionResponse> {
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
