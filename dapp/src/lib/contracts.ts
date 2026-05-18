import { BrowserProvider, Contract, JsonRpcProvider, type ContractTransactionResponse, type Signer, ZeroAddress } from 'ethers';
import { type DappNetwork } from '../config/networks';
import { getNativeWrapperAddress, isNativeWrapperConfigured } from '../config/native';

export { getNativeWrapperAddress, isNativeWrapperConfigured };

export function alignToWrapperRate(amountWei: bigint, rate: bigint): bigint {
  if (rate <= 0n) return amountWei;
  return (amountWei / rate) * rate;
}
import { type EthereumProvider } from './nixProvider';

export const WRAPPER_ABI = [
  'function shield(address to, uint256 amount) external returns (bytes32)',
  'function shieldNative(address to) external payable returns (bytes32)',
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

export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function transfer(address to, uint256 amount) external returns (bool)',
] as const;

export interface TokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
}

export interface PendingClaim {
  to: string;
  ctHash: string;
  requestedAmount: bigint;
  decryptedAmount: bigint;
  claimed: boolean;
}

export function getReadProvider(network: DappNetwork) {
  return new JsonRpcProvider(network.rpc, {
    chainId: network.chainId,
    name: network.name,
  });
}

async function waitForTransaction(network: DappNetwork, tx: ContractTransactionResponse, signer?: Signer) {
  const provider = signer?.provider;
  if (provider) {
    const receipt = await provider.waitForTransaction(tx.hash, 1);
    if (!receipt) throw new Error('Transaction was not confirmed.');
    if (receipt.status !== 1) throw new Error('Transaction reverted on-chain.');
    return receipt;
  }
  const receipt = await getReadProvider(network).waitForTransaction(tx.hash, 1);
  if (!receipt) throw new Error('Transaction was not confirmed.');
  if (receipt.status !== 1) throw new Error('Transaction reverted on-chain.');
  return receipt;
}

export async function getInjectedSigner(provider: EthereumProvider, network?: DappNetwork): Promise<Signer> {
  const browserProvider = network
    ? new BrowserProvider(provider, network.chainId)
    : new BrowserProvider(provider);
  return browserProvider.getSigner();
}

export function getRegistry(network: DappNetwork, signerOrProvider: Signer | JsonRpcProvider) {
  if (!network.registryAddress || network.registryAddress === ZeroAddress) {
    throw new Error(`Registry not configured for ${network.name}`);
  }
  return new Contract(network.registryAddress, REGISTRY_ABI, signerOrProvider);
}

export async function getTokenMetadata(network: DappNetwork, tokenAddress: string): Promise<TokenMetadata> {
  const token = new Contract(tokenAddress, ERC20_ABI, getReadProvider(network));
  const [name, symbol, decimals] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
  ]);
  return {
    address: tokenAddress,
    name,
    symbol,
    decimals: Number(decimals),
  };
}

export async function getWrapperAddress(network: DappNetwork, tokenAddress: string): Promise<string | null> {
  const registry = getRegistry(network, getReadProvider(network));
  const wrapper = await registry.getWrapper(tokenAddress);
  return wrapper === ZeroAddress ? null : wrapper;
}

export async function getOrCreateWrapper(network: DappNetwork, signer: Signer, tokenAddress: string): Promise<string> {
  const registry = getRegistry(network, signer);
  const current = await registry.getWrapper(tokenAddress);
  if (current !== ZeroAddress) return current;
  const tx: ContractTransactionResponse = await registry.getOrCreateWrapper(tokenAddress);
  await waitForTransaction(network, tx, signer);
  const wrapper = await registry.getWrapper(tokenAddress);
  if (wrapper === ZeroAddress) throw new Error('Wrapper deployment failed');
  return wrapper;
}

export async function getPublicBalance(network: DappNetwork, tokenAddress: string, account: string): Promise<bigint> {
  const token = new Contract(tokenAddress, ERC20_ABI, getReadProvider(network));
  return token.balanceOf(account);
}

export async function getAllowance(network: DappNetwork, tokenAddress: string, owner: string, spender: string): Promise<bigint> {
  const token = new Contract(tokenAddress, ERC20_ABI, getReadProvider(network));
  return token.allowance(owner, spender);
}

export async function approveWrapper(network: DappNetwork, signer: Signer, tokenAddress: string, wrapperAddress: string, amount: bigint) {
  const token = new Contract(tokenAddress, ERC20_ABI, signer);
  const tx: ContractTransactionResponse = await token.approve(wrapperAddress, amount);
  return waitForTransaction(network, tx, signer);
}

export async function transferToken(network: DappNetwork, signer: Signer, tokenAddress: string, to: string, amount: bigint) {
  const token = new Contract(tokenAddress, ERC20_ABI, signer);
  const tx: ContractTransactionResponse = await token.transfer(to, amount);
  return waitForTransaction(network, tx, signer);
}

export async function shield(network: DappNetwork, signer: Signer, wrapperAddress: string, to: string, amount: bigint) {
  const wrapper = new Contract(wrapperAddress, WRAPPER_ABI, signer);
  const tx: ContractTransactionResponse = await wrapper.shield(to, amount);
  return waitForTransaction(network, tx, signer);
}

export async function shieldNative(network: DappNetwork, signer: Signer, to: string, amountWei: bigint) {
  const wrapperAddress = getNativeWrapperAddress(network.id);
  if (!isNativeWrapperConfigured(network.id)) {
    throw new Error('Native ETH wrapper not deployed on this network.');
  }
  const wrapper = new Contract(wrapperAddress, WRAPPER_ABI, signer);
  const rate = await wrapper.rate() as bigint;
  const aligned = alignToWrapperRate(amountWei, rate);
  if (aligned === 0n) throw new Error('Amount too small after rate alignment.');
  const tx: ContractTransactionResponse = await wrapper.shieldNative(to, { value: aligned });
  return waitForTransaction(network, tx, signer);
}

export async function getNativePublicBalance(network: DappNetwork, account: string): Promise<bigint> {
  return getReadProvider(network).getBalance(account);
}

export async function requestUnshield(network: DappNetwork, signer: Signer, wrapperAddress: string, from: string, to: string, amount: bigint) {
  const wrapper = new Contract(wrapperAddress, WRAPPER_ABI, signer);
  const tx: ContractTransactionResponse = await wrapper.unshield(from, to, amount);
  return waitForTransaction(network, tx, signer);
}

export async function claimUnshielded(
  network: DappNetwork,
  signer: Signer,
  wrapperAddress: string,
  requestId: string,
  decryptedValue: bigint,
  signature: string,
) {
  const wrapper = new Contract(wrapperAddress, WRAPPER_ABI, signer);
  const tx: ContractTransactionResponse = await wrapper.claimUnshielded(requestId, decryptedValue, signature);
  return waitForTransaction(network, tx, signer);
}

export async function claimUnshieldedBatch(
  network: DappNetwork,
  signer: Signer,
  wrapperAddress: string,
  requestIds: string[],
  decryptedValues: bigint[],
  signatures: string[],
) {
  const wrapper = new Contract(wrapperAddress, WRAPPER_ABI, signer);
  const tx: ContractTransactionResponse = await wrapper.claimUnshieldedBatch(requestIds, decryptedValues, signatures);
  return waitForTransaction(network, tx, signer);
}

export interface EncryptedAmountInput {
  ctHash: bigint | string;
  securityZone: number;
  utype: number;
  signature: string;
}

export async function confidentialTransfer(
  network: DappNetwork,
  signer: Signer,
  wrapperAddress: string,
  to: string,
  encryptedAmount: EncryptedAmountInput,
) {
  const wrapper = new Contract(wrapperAddress, WRAPPER_ABI, signer);
  const tx: ContractTransactionResponse = await wrapper.confidentialTransfer(to, encryptedAmount);
  return waitForTransaction(network, tx, signer);
}

export async function getEncryptedBalance(network: DappNetwork, wrapperAddress: string, account: string): Promise<string> {
  const wrapper = new Contract(wrapperAddress, WRAPPER_ABI, getReadProvider(network));
  return wrapper.confidentialBalanceOf(account);
}

export async function getPendingClaims(network: DappNetwork, wrapperAddress: string, account: string): Promise<PendingClaim[]> {
  const wrapper = new Contract(wrapperAddress, WRAPPER_ABI, getReadProvider(network));
  const claims = await wrapper.getUserClaims(account);
  return claims
    .map((claim: PendingClaim) => claim)
    .filter((claim: PendingClaim) => !claim.claimed);
}
