/**
 * Contract interaction helpers for ConfidentialWrapper
 */
import { ethers } from 'ethers';

// ABI for the ConfidentialWrapper contract (coFHE version)
export const WRAPPER_ABI = [
  'function wrap(address token, uint128 amount) external',
  'function requestUnwrap(address token, tuple(uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature) encryptedAmount) external',
  'function finalizeUnwrap(address token, bytes32 ctHash, uint256 decryptedValue, bytes signature) external',
  'function transferEncrypted(address token, address to, tuple(uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature) encryptedAmount) external',
  'function getBalance(address token) external view returns (bytes32)',
  'function getPendingUnwrap(address token) external view returns (bytes32)',
  'event Wrapped(address indexed token, address indexed user, uint128 amount)',
  'event UnwrapRequested(address indexed token, address indexed user)',
  'event UnwrapFinalized(address indexed token, address indexed user, uint128 amount)',
  'event ConfidentialTransfer(address indexed token, address indexed from, address indexed to)',
] as const;

// Contract addresses
export const CONTRACTS: Record<string, string> = {
  wrapper: '0xd169FD88Ef96942A4deBdAde364Ca38dD0575873', // Sepolia Deployment (euint128)
  underlying: '0x05B84E1A04b93E6999b80323B1d0a52eDa99A7dC' // Mock ERC20 (Fresh)
};

export function setContractAddress(key: string, address: string) {
  CONTRACTS[key] = address;
}

/** Get a ConfidentialWrapper contract instance */
export function getWrapperContract(signer: ethers.Signer): ethers.Contract {
  return new ethers.Contract(CONTRACTS.wrapper, WRAPPER_ABI, signer);
}

/** Wrap public ERC20 into encrypted FHE balance */
export async function wrapTokens(signer: ethers.Signer, tokenAddress: string, amount: bigint): Promise<ethers.ContractTransactionResponse> {
  const underlying = new ethers.Contract(
    tokenAddress,
    ['function approve(address spender, uint256 amount) external returns (bool)'],
    signer
  );
  const approveTx = await underlying.approve(CONTRACTS.wrapper, amount);
  await approveTx.wait();

  const wrapper = getWrapperContract(signer);
  return wrapper.wrap(tokenAddress, amount);
}

/** Request unwrap (step 1 of 2) */
export async function requestUnwrap(
  signer: ethers.Signer,
  tokenAddress: string,
  encryptedAmount: any
): Promise<ethers.ContractTransactionResponse> {
  const wrapper = getWrapperContract(signer);
  return wrapper.requestUnwrap(tokenAddress, encryptedAmount);
}

/** Finalize unwrap with decrypted value + signature (step 2 of 2) */
export async function finalizeUnwrap(
  signer: ethers.Signer,
  tokenAddress: string,
  ctHash: string,
  decryptedValue: bigint,
  signature: string
): Promise<ethers.ContractTransactionResponse> {
  const wrapper = getWrapperContract(signer);
  return wrapper.finalizeUnwrap(tokenAddress, ctHash, decryptedValue, signature);
}

/** Encrypted transfer to another address */
export async function transferEncrypted(
  signer: ethers.Signer,
  tokenAddress: string,
  to: string,
  encryptedAmount: any
): Promise<ethers.ContractTransactionResponse> {
  const wrapper = getWrapperContract(signer);
  return wrapper.transferEncrypted(tokenAddress, to, encryptedAmount);
}

/** Get encrypted balance ctHash */
export async function getEncryptedBalance(signer: ethers.Signer, tokenAddress: string): Promise<string> {
  const wrapper = getWrapperContract(signer);
  return wrapper.getBalance(tokenAddress);
}

/** Get pending unwrap ctHash */
export async function getPendingUnwrap(signer: ethers.Signer, tokenAddress: string): Promise<string> {
  const wrapper = getWrapperContract(signer);
  return wrapper.getPendingUnwrap(tokenAddress);
}
