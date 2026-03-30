/**
 * CoFHE SDK integration — encrypt/decrypt helpers for Fhenix
 * 
 * Key decisions:
 * - Uses @cofhe/sdk/web for browser WASM/tweetnacl support
 * - Disables iframe-shared-storage via `fheKeyStorage: null` (Chrome extension CSP blocks iframes)
 * - Uses PermitUtils directly for permit creation/signing (bypasses client cache issues)
 * - Manages viem PublicClient + WalletClient for EIP-712 permit signatures
 */

import { Encryptable, FheTypes } from '@cofhe/sdk';
import { createCofheConfig, createCofheClient } from '@cofhe/sdk/web';
import { sepolia as cofheSepolia } from '@cofhe/sdk/chains';
import { PermitUtils } from '@cofhe/sdk/permits';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia as viemSepolia } from 'viem/chains';

export type CofheClient = any;

let _client: CofheClient | null = null;
let _currentPk: string | null = null;
let _publicClient: any = null;
let _walletClient: any = null;

/**
 * Initialize the CoFHE client with the user's private key.
 * Creates viem clients and connects them to the SDK.
 * Idempotent — skips if already initialized with the same key.
 */
export async function initCofheClient(privateKeyHex: string) {
  // Ensure 0x prefix
  const pk = privateKeyHex.startsWith('0x') ? privateKeyHex : `0x${privateKeyHex}`;
  
  if (_client && _currentPk === pk) return;

  // Reset state for fresh initialization
  _client = null;
  _publicClient = null;
  _walletClient = null;
  _currentPk = null;

  const account = privateKeyToAccount(pk as `0x${string}`);
  
  _publicClient = createPublicClient({
    chain: viemSepolia,
    transport: http('https://ethereum-sepolia-rpc.publicnode.com')
  });

  _walletClient = createWalletClient({
    account,
    chain: viemSepolia,
    transport: http('https://ethereum-sepolia-rpc.publicnode.com')
  });

  // Critical: fheKeyStorage: null prevents iframe-shared-storage injection
  // which crashes inside Chrome extension popup CSP
  const config = createCofheConfig({
    environment: 'web',
    supportedChains: [cofheSepolia as any],
    fheKeyStorage: null,
  });

  _client = createCofheClient(config as any);
  await _client.connect(_publicClient, _walletClient);
  _currentPk = pk;
}

/** Get the initialized CoFHE client */
export function getCofheClient(): CofheClient | null {
  return _client;
}

/** Set the CoFHE client after initialization */
export function setCofheClient(client: CofheClient) {
  _client = client;
}

/** Encrypt a uint128 amount for contract input */
export async function encryptAmount(amount: bigint): Promise<any> {
  if (!_client) throw new Error('CoFHE client not initialized');
  const [encrypted] = await _client
    .encryptInputs([Encryptable.uint128(amount)])
    .execute();
  return encrypted;
}

/**
 * Decrypt a ctHash for UI display (view-only, no on-chain signature).
 * Creates a fresh SelfPermit via PermitUtils (bypasses IndexedDB cache),
 * signs it with the local viem WalletClient, then uses it to unseal from the Threshold Network.
 */
export async function decryptForView(ctHash: string, chainId: number, accountAddr: string): Promise<bigint> {
  if (!_client || !_publicClient || !_walletClient) {
    throw new Error('CoFHE client not initialized');
  }

  // Use PermitUtils directly — creates a fresh permit each time,
  // avoiding any stale IndexedDB cache from previous failed attempts
  const unsigned = PermitUtils.createSelf({ issuer: accountAddr });
  const permit = await PermitUtils.sign(unsigned, _publicClient, _walletClient);

  const value = await _client
    .decryptForView(ctHash, FheTypes.Uint128)
    .setChainId(chainId)
    .setAccount(accountAddr)
    .withPermit(permit)
    .execute();
  return value;
}

/** Decrypt a ctHash for on-chain usage (returns value + signature) */
export async function decryptForTransaction(ctHash: string, chainId: number, accountAddr: string): Promise<{
  decryptedValue: bigint;
  signature: string;
}> {
  if (!_client || !_publicClient || !_walletClient) {
    throw new Error('CoFHE client not initialized');
  }

  // Revert back to withPermit: The CoFHE SDK requires explicit permits for most operations,
  // and using withoutPermit() results in a 403 Forbidden.
  const unsigned = PermitUtils.createSelf({ issuer: accountAddr });
  const permit = await PermitUtils.sign(unsigned, _publicClient, _walletClient);

  const result = await _client
    .decryptForTx(ctHash)
    .setChainId(chainId)
    .setAccount(accountAddr)
    .withPermit(permit)
    .execute();
  return result;
}

/** Re-export commonly used types */
export { Encryptable, FheTypes };
