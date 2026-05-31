import { ethers } from 'ethers';
import { addActivity } from './activity';
import {
  getOrCreateWrapper,
  getWrapperAddress,
  isNativeTokenAddress,
  isNativeWrapperConfigured,
  shieldNative,
  waitForAllowance,
  WRAPPER_ABI,
} from './contracts';
import { initCofheClient, encryptAmount64, decryptForTx, decryptForView, FheTypes } from './cofhe';
import { withDecryptRetry } from './decryptRetry';
import { getSigner, getProvider, getActiveNetwork, formatUnitsDisplay, setActiveNetwork, type NetworkId } from './wallet';
import type { NixBotIntent, NixBotToken } from './nixBotParser';

export type ProgressCallback = (message: string) => void;

export interface ExecuteResult {
  success: boolean;
  message: string;
  txHash?: string;
}

export interface PrivateSendPrecheckResult {
  requested: bigint;
  available: bigint;
  sufficient: boolean;
}

const TX_CONFIRM_TIMEOUT_MS = 120000;
const CLAIM_DECRYPT_TIMEOUT_MS = 45000;

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function waitForTxConfirmation(tx: ethers.TransactionResponse, context: string): Promise<ethers.TransactionReceipt> {
  const receipt = await withTimeout(
    tx.wait(),
    TX_CONFIRM_TIMEOUT_MS,
    `${context} is taking longer than expected. Tx submitted: ${tx.hash}. Check explorer and try again if needed.`,
  );
  if (!receipt) throw new Error(`${context} failed to return a transaction receipt.`);
  return receipt;
}

export function describeIntent(intent: NixBotIntent): string {
  if (intent.errors.length > 0) {
    return intent.errors.join(' ');
  }
  const token = intent.token?.symbol || 'token';
  switch (intent.action) {
    case 'send':
      return intent.mode === 'private'
        ? `Private send ${intent.amount} c${token} to ${intent.recipient?.slice(0, 10)}...`
        : `Send ${intent.amount} ${token} to ${intent.recipient?.slice(0, 10)}...`;
    case 'wrap':
      return `Wrap ${intent.amount} ${token} into confidential balance`;
    case 'unwrap':
      return `Unwrap ${intent.amount} c${token} back to public`;
    case 'claimAll':
      return intent.token ? `Claim all pending ${token} unwraps` : 'Claim all pending unwraps';
    case 'revealBalance':
      return intent.token ? `Reveal private balance for ${token}` : 'Reveal all private balances';
    case 'checkBalance':
      return intent.token ? `Check balance for ${token}` : 'Check all balances';
    case 'switchNetwork':
      return `Switch active network to ${intent.amount || 'selected chain'}`;
    default:
      return 'Process your request';
  }
}

async function ensureWrapper(
  signer: ethers.Signer,
  token: NixBotToken,
  onProgress?: ProgressCallback,
): Promise<string> {
  if (isNativeTokenAddress(token.address)) {
    if (!isNativeWrapperConfigured(getActiveNetwork().id)) {
      throw new Error('Native ETH wrapper is not configured on this network.');
    }
    const addr = await getWrapperAddress(signer.provider!, token.address);
    if (!addr) throw new Error('Native wrapper address missing.');
    return addr;
  }
  onProgress?.('Checking wrapper...');
  let addr = await getWrapperAddress(signer.provider!, token.address);
  if (!addr) {
    onProgress?.('Deploying wrapper (first use on this token)...');
    addr = await getOrCreateWrapper(signer, token.address);
  }
  return addr;
}

async function getPublicBalance(token: NixBotToken, walletAddress: string): Promise<bigint> {
  const provider = getProvider();
  if (isNativeTokenAddress(token.address)) {
    return provider.getBalance(walletAddress);
  }
  const erc20 = new ethers.Contract(
    token.address,
    ['function balanceOf(address) view returns (uint256)'],
    provider,
  );
  return erc20.balanceOf(walletAddress) as Promise<bigint>;
}

async function getPrivateBalance(token: NixBotToken, walletAddress: string): Promise<bigint> {
  const provider = getProvider();
  const network = getActiveNetwork();
  const wrapperAddr = await getWrapperAddress(provider, token.address);
  if (!wrapperAddr) return 0n;

  const wrapper = new ethers.Contract(
    wrapperAddr,
    ['function confidentialBalanceOf(address) external view returns (bytes32)'],
    provider,
  );
  const ctHash: string = await wrapper.confidentialBalanceOf(walletAddress);
  if (ctHash === `0x${'0'.repeat(64)}`) return 0n;

  return withTimeout(
    decryptForView(ctHash, network.chainId, walletAddress, FheTypes.Uint64),
    20000,
    `Private balance check timed out for c${token.symbol}. Try "reveal private balance ${token.symbol.toLowerCase()}" first, then retry.`,
  );
}

export async function precheckPrivateSendBalance(
  token: NixBotToken,
  amount: string,
  walletAddress: string,
  privateKey: string,
  onProgress?: ProgressCallback,
): Promise<PrivateSendPrecheckResult> {
  onProgress?.(`Decrypting c${token.symbol} balance...`);
  await initCofheClient(privateKey);
  const requested = ethers.parseUnits(amount, 6);
  const available = await getPrivateBalance(token, walletAddress);
  return {
    requested,
    available,
    sufficient: available >= requested,
  };
}

async function executeSend(
  intent: NixBotIntent,
  address: string,
  privateKey: string,
  onProgress?: ProgressCallback,
): Promise<ExecuteResult> {
  const token = intent.token!;
  const amount = intent.amount!;
  const recipient = intent.recipient!;
  const network = getActiveNetwork();
  const signer = getSigner(privateKey);
  const isNative = isNativeTokenAddress(token.address);
  const publicDecimals = token.decimals || 18;

  if (intent.mode === 'public') {
    onProgress?.('Checking available balance...');
    const parsedAmount = ethers.parseUnits(amount, publicDecimals);
    const available = await getPublicBalance(token, address);
    if (available < parsedAmount) {
      throw new Error(
        `Insufficient public ${token.symbol} balance. Available: ${formatUnitsDisplay(available, publicDecimals)}, requested: ${amount}.`,
      );
    }

    onProgress?.('Submitting public transfer...');
    let tx: ethers.TransactionResponse;
    if (isNative) {
      tx = await signer.sendTransaction({ to: recipient, value: ethers.parseEther(amount) });
    } else {
      const erc20 = new ethers.Contract(
        token.address,
        ['function transfer(address to, uint256 amount) external returns (bool)'],
        signer,
      );
      tx = await erc20.transfer(recipient, parsedAmount);
    }
    await addActivity({
      id: tx.hash, type: 'send', amount: `${amount} ${token.symbol}`,
      status: 'pending', networkId: network.id, address, hash: tx.hash, isConfidential: false, recipient,
      tokenSymbol: token.symbol, tokenAddress: token.address, chainId: network.chainId, txStage: 'nixbot-submitted',
    });
    onProgress?.('Waiting for confirmation...');
    await waitForTxConfirmation(tx, 'Public transfer confirmation');
    await addActivity({
      id: tx.hash, type: 'send', amount: `${amount} ${token.symbol}`,
      status: 'success', networkId: network.id, address, hash: tx.hash, isConfidential: false, recipient,
      tokenSymbol: token.symbol, tokenAddress: token.address, chainId: network.chainId, txStage: 'nixbot-confirmed',
    });
    return {
      success: true,
      message: `Done — sent ${amount} ${token.symbol} to ${recipient.slice(0, 6)}...${recipient.slice(-4)}.`,
      txHash: tx.hash,
    };
  }

  onProgress?.('Initializing confidential client...');
  await initCofheClient(privateKey);
  const parsedPrivateAmount = ethers.parseUnits(amount, 6);

  onProgress?.('Encrypting amount...');
  const encrypted = await encryptAmount64(parsedPrivateAmount);
  const wrapperAddr = await ensureWrapper(signer, token, onProgress);
  const wrapper = new ethers.Contract(
    wrapperAddr,
    ['function confidentialTransfer(address to, tuple(uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature) encryptedAmount) external'],
    signer,
  );
  onProgress?.('Submitting confidential transfer...');
  const tx = await wrapper.confidentialTransfer(recipient, {
    ctHash: encrypted.ctHash,
    securityZone: encrypted.securityZone ?? 0,
    utype: encrypted.utype,
    signature: encrypted.signature,
  });
  await addActivity({
    id: tx.hash, type: 'confidential-transfer', amount: `${amount} c${token.symbol}`,
    status: 'pending', networkId: network.id, address, hash: tx.hash, isConfidential: true, recipient,
    tokenSymbol: `c${token.symbol}`, tokenAddress: token.address, chainId: network.chainId, txStage: 'nixbot-submitted',
  });
  onProgress?.('Waiting for confirmation...');
  await waitForTxConfirmation(tx, 'Private transfer confirmation');
  await addActivity({
    id: tx.hash, type: 'confidential-transfer', amount: `${amount} c${token.symbol}`,
    status: 'success', networkId: network.id, address, hash: tx.hash, isConfidential: true, recipient,
    tokenSymbol: `c${token.symbol}`, tokenAddress: token.address, chainId: network.chainId, txStage: 'nixbot-confirmed',
  });
  return {
    success: true,
    message: `Done — privately sent ${amount} c${token.symbol} to ${recipient.slice(0, 6)}...${recipient.slice(-4)}.`,
    txHash: tx.hash,
  };
}

async function executeWrap(
  intent: NixBotIntent,
  address: string,
  privateKey: string,
  onProgress?: ProgressCallback,
): Promise<ExecuteResult> {
  const token = intent.token!;
  const amount = intent.amount!;
  const network = getActiveNetwork();
  const signer = getSigner(privateKey);
  const decimals = token.decimals || 18;
  const parsed = ethers.parseUnits(amount, decimals);
  if (parsed === 0n) throw new Error('Amount must be greater than 0.');

  let wrapTx: ethers.ContractTransactionResponse;
  const isNative = isNativeTokenAddress(token.address);

  if (isNative) {
    onProgress?.('Shielding ETH to cETH...');
    wrapTx = await shieldNative(signer, address, parsed);
  } else {
    const wrapperAddr = await ensureWrapper(signer, token, onProgress);
    onProgress?.('Approving tokens...');
    const underlying = new ethers.Contract(
      token.address,
      ['function approve(address spender, uint256 amount) external returns (bool)'],
      signer,
    );
    const approveTx = await underlying.approve(wrapperAddr, parsed);
    await waitForTxConfirmation(approveTx, `${token.symbol} approval`);
    onProgress?.('Confirming approval on-chain...');
    await waitForAllowance(signer.provider!, token.address, address, wrapperAddr, parsed);
    onProgress?.('Shielding to confidential balance...');
    const wrapper = new ethers.Contract(
      wrapperAddr,
      ['function shield(address to, uint256 amount) external returns (bytes32)'],
      signer,
    );
    wrapTx = await wrapper.shield(address, parsed);
  }

  const confidentialSymbol = isNative ? 'cETH' : `c${token.symbol}`;
  await addActivity({
    id: wrapTx.hash, type: 'wrap', amount: `${amount} ${token.symbol}`,
    status: 'pending', networkId: network.id, address, hash: wrapTx.hash, isConfidential: true,
    tokenSymbol: token.symbol, tokenAddress: token.address, chainId: network.chainId, txStage: 'nixbot-submitted',
  });
  onProgress?.('Waiting for confirmation...');
  await waitForTxConfirmation(wrapTx, 'Wrap confirmation');
  await addActivity({
    id: wrapTx.hash, type: 'wrap', amount: `${amount} ${confidentialSymbol}`,
    status: 'success', networkId: network.id, address, hash: wrapTx.hash, isConfidential: true,
    tokenSymbol: confidentialSymbol, tokenAddress: token.address, chainId: network.chainId, txStage: 'nixbot-confirmed',
  });
  return {
    success: true,
    message: `Wrapped ${amount} ${token.symbol} into ${confidentialSymbol}.`,
    txHash: wrapTx.hash,
  };
}

async function finalizeClaim(
  pendingCtHash: string,
  wrapperAddr: string,
  token: NixBotToken,
  address: string,
  privateKey: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  await initCofheClient(privateKey);
  const network = getActiveNetwork();
  onProgress?.('Syncing with threshold node...');
  const res = await withDecryptRetry(
    () => decryptForTx(pendingCtHash, network.chainId, address, 'withoutPermit'),
    { maxAttempts: 12, baseDelayMs: 1500, maxDelayMs: 6000 },
  );
  onProgress?.('Submitting claim...');
  const signer = getSigner(privateKey);
  const wrapper = new ethers.Contract(
    wrapperAddr,
    ['function claimUnshielded(bytes32,uint64,bytes) external'],
    signer,
  );
  const finTx = await wrapper.claimUnshielded(pendingCtHash, res.decryptedValue, res.signature);
  const claimedDisplay = ethers.formatUnits(res.decryptedValue, 6);
  await addActivity({
    id: finTx.hash, type: 'unwrap', amount: `${claimedDisplay} ${token.symbol}`,
    status: 'pending', networkId: network.id, address, hash: finTx.hash, isConfidential: true,
    tokenSymbol: token.symbol, tokenAddress: token.address, chainId: network.chainId, txStage: 'nixbot-claim-submitted',
  });
  await waitForTxConfirmation(finTx, 'Claim confirmation');
  await addActivity({
    id: finTx.hash, type: 'unwrap', amount: `${claimedDisplay} ${token.symbol}`,
    status: 'success', networkId: network.id, address, hash: finTx.hash, isConfidential: true,
    tokenSymbol: token.symbol, tokenAddress: token.address, chainId: network.chainId, txStage: 'nixbot-claim-confirmed',
  });
  return finTx.hash;
}

async function executeUnwrap(
  intent: NixBotIntent,
  address: string,
  privateKey: string,
  onProgress?: ProgressCallback,
): Promise<ExecuteResult> {
  const token = intent.token!;
  const amount = intent.amount!;
  const network = getActiveNetwork();
  const signer = getSigner(privateKey);
  const wrapperAddr = await ensureWrapper(signer, token, onProgress);
  const wrapper = new ethers.Contract(wrapperAddr, WRAPPER_ABI, signer);
  const parsed = ethers.parseUnits(amount, 6);
  if (parsed === 0n) throw new Error('Amount must be greater than 0.');

  onProgress?.('Creating unwrap request...');
  const reqTx = await wrapper.unshield(address, address, parsed);
  await addActivity({
    id: reqTx.hash, type: 'unwrap', amount: `${amount} c${token.symbol}`,
    status: 'pending', networkId: network.id, address, isConfidential: true,
    tokenSymbol: `c${token.symbol}`, tokenAddress: token.address, chainId: network.chainId, txStage: 'nixbot-unshield-requested',
  });
  const receipt = await waitForTxConfirmation(reqTx, 'Unwrap request confirmation');
  
  let pendingCtHash: string | null = null;

  // 1. Try to extract ctHash directly from Unshielded event log
  try {
    const topicUnshielded = ethers.id('Unshielded(address,uint256)');
    for (const log of receipt?.logs || []) {
      if (
        log.address.toLowerCase() === wrapperAddr.toLowerCase() &&
        log.topics[0] === topicUnshielded &&
        log.topics[2]
      ) {
        pendingCtHash = log.topics[2];
        break;
      }
    }
  } catch (e) {
    // fallback
  }

  // 2. Fallback to polling getUserClaims to handle RPC node synchronization delay
  if (!pendingCtHash) {
    onProgress?.('Syncing claim with network...');
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const claims = await wrapper.getUserClaims(address);
        const pending = claims.filter((c: { claimed: boolean }) => !c.claimed);
        const latest = pending[pending.length - 1];
        if (latest) {
          pendingCtHash = latest.ctHash;
          break;
        }
      } catch (err) {
        // Ignore and retry
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  if (!pendingCtHash) {
    return {
      success: true,
      message: `Unwrap requested but claim is not visible on-chain yet. You can claim it using "Claim All" in a few seconds.`,
      txHash: reqTx.hash,
    };
  }

  const claimHash = await finalizeClaim(pendingCtHash, wrapperAddr, token, address, privateKey, onProgress);
  return {
    success: true,
    message: `Unwrapped ${amount} c${token.symbol} back to public balance.`,
    txHash: claimHash,
  };
}

async function resolveClaimTarget(
  intent: NixBotIntent,
  address: string,
  allTokens: NixBotToken[],
): Promise<{ token: NixBotToken; pending: { ctHash: string }[]; wrapperAddr: string }> {
  const provider = getProvider();
  const candidates = intent.token ? [intent.token] : allTokens;

  for (const candidate of candidates) {
    const wrapperAddr = await getWrapperAddress(provider, candidate.address);
    if (!wrapperAddr) continue;
    const wrapper = new ethers.Contract(wrapperAddr, WRAPPER_ABI, provider);
    const claims = await wrapper.getUserClaims(address);
    const pending = claims.filter((c: { claimed: boolean }) => !c.claimed);
    if (pending.length > 0) {
      return { token: candidate, pending, wrapperAddr };
    }
  }
  throw new Error(intent.token
    ? `No pending claims for ${intent.token.symbol}.`
    : 'No pending claims on any token right now.');
}

async function executeClaimAll(
  intent: NixBotIntent,
  address: string,
  privateKey: string,
  allTokens: NixBotToken[],
  onProgress?: ProgressCallback,
): Promise<ExecuteResult> {
  const network = getActiveNetwork();
  const signer = getSigner(privateKey);

  const { token: tokenMeta, pending, wrapperAddr } = await resolveClaimTarget(intent, address, allTokens);

  await initCofheClient(privateKey);
  const ids: string[] = [];
  const amounts: bigint[] = [];
  const proofs: string[] = [];

  for (let i = 0; i < pending.length; i++) {
    const claim = pending[i];
    onProgress?.(`Decrypting claim ${i + 1}/${pending.length}...`);
    const res = await withTimeout(
      withDecryptRetry(
        () => decryptForTx(claim.ctHash, network.chainId, address, 'withoutPermit'),
        { maxAttempts: 10, baseDelayMs: 1200, maxDelayMs: 5000 },
      ),
      CLAIM_DECRYPT_TIMEOUT_MS,
      `Claim decrypt ${i + 1}/${pending.length} timed out. Try "claim all ${tokenMeta.symbol.toLowerCase()}" again in a moment.`,
    );
    ids.push(claim.ctHash);
    amounts.push(res.decryptedValue);
    proofs.push(res.signature);
  }

  onProgress?.('Submitting batch claim...');
  const wrapperSigner = new ethers.Contract(wrapperAddr, WRAPPER_ABI, signer);
  const tx = await wrapperSigner.claimUnshieldedBatch(ids, amounts, proofs);
  await waitForTxConfirmation(tx, 'Batch claim confirmation');

  return {
    success: true,
    message: `Claimed ${pending.length} pending unwrap${pending.length > 1 ? 's' : ''} for ${tokenMeta.symbol}.`,
    txHash: tx.hash,
  };
}

async function executeRevealBalance(
  intent: NixBotIntent,
  address: string,
  privateKey: string,
  allTokens: NixBotToken[],
  onProgress?: ProgressCallback,
): Promise<ExecuteResult> {
  onProgress?.('Initializing confidential client...');
  await initCofheClient(privateKey);

  const provider = getProvider();
  const network = getActiveNetwork();
  const targets = intent.token ? [intent.token] : allTokens;
  const lines: string[] = [];

  for (const token of targets) {
    const wrapperAddr = await getWrapperAddress(provider, token.address);
    if (!wrapperAddr) {
      if (intent.token) {
        return {
          success: true,
          message: `No confidential wrapper found for ${token.symbol} yet. Wrap some first, then reveal balance.`,
        };
      }
      continue;
    }

    onProgress?.(`Decrypting private ${token.symbol} balance...`);
    const wrapper = new ethers.Contract(
      wrapperAddr,
      ['function confidentialBalanceOf(address) external view returns (bytes32)'],
      provider,
    );
    const ctHash: string = await wrapper.confidentialBalanceOf(address);
    if (ctHash === `0x${'0'.repeat(64)}`) {
      lines.push(`• c${token.symbol}: 0.00`);
      continue;
    }

    const decrypted = await decryptForView(ctHash, network.chainId, address, FheTypes.Uint64);
    lines.push(`• c${token.symbol}: ${formatUnitsDisplay(decrypted, 6)}`);
  }

  if (lines.length === 0) {
    return {
      success: true,
      message: 'No confidential balances found yet. Wrap tokens first, then ask me to reveal them.',
    };
  }

  return {
    success: true,
    message: `Private balances:\n${lines.join('\n')}`,
  };
}

async function executeCheckBalance(
  intent: NixBotIntent,
  address: string,
  privateKey: string,
  allTokens: NixBotToken[],
  onProgress?: ProgressCallback,
): Promise<ExecuteResult> {
  onProgress?.('Fetching balances...');
  const targets = intent.token ? [intent.token] : allTokens;
  const lines: string[] = [];
  const network = getActiveNetwork();
  const provider = getProvider();

  for (const token of targets) {
    onProgress?.(`Fetching ${token.symbol} balances...`);
    const pubBal = await getPublicBalance(token, address);
    
    let privBalStr = '0.00';
    const wrapperAddr = await getWrapperAddress(provider, token.address);
    if (wrapperAddr) {
      const wrapper = new ethers.Contract(
        wrapperAddr,
        ['function confidentialBalanceOf(address) external view returns (bytes32)'],
        provider,
      );
      const ctHash = await wrapper.confidentialBalanceOf(address);
      if (ctHash !== `0x${'0'.repeat(64)}`) {
        try {
          await initCofheClient(privateKey);
          const decrypted = await decryptForView(ctHash, network.chainId, address, FheTypes.Uint64);
          privBalStr = formatUnitsDisplay(decrypted, 6);
        } catch {
          privBalStr = 'Locked / Error';
        }
      }
    }
    
    const publicDecimals = token.decimals || 18;
    lines.push(
      `• ${token.symbol}: Public: ${formatUnitsDisplay(pubBal, publicDecimals)} | Confidential: ${privBalStr}`
    );
  }

  return {
    success: true,
    message: `Balances overview:\n${lines.join('\n')}`,
  };
}

async function executeSwitchNetwork(
  intent: NixBotIntent,
  onProgress?: ProgressCallback,
): Promise<ExecuteResult> {
  const networkId = intent.recipient as NetworkId;
  const networkName = intent.amount!;
  if (!networkId) {
    throw new Error('No network target specified.');
  }
  onProgress?.(`Switching network to ${networkName}...`);
  setActiveNetwork(networkId);
  return {
    success: true,
    message: `Successfully switched to ${networkName}. Quick-updating your session.`,
  };
}

export async function executeNixBotIntent(
  intent: NixBotIntent,
  ctx: { address: string; privateKey: string; tokens: NixBotToken[] },
  onProgress?: ProgressCallback,
): Promise<ExecuteResult> {
  try {
    switch (intent.action) {
      case 'send':
        if (!intent.token || !intent.amount || !intent.recipient) {
          throw new Error('Send command is incomplete.');
        }
        return executeSend(intent, ctx.address, ctx.privateKey, onProgress);
      case 'wrap':
        if (!intent.token || !intent.amount) throw new Error('Wrap command is incomplete.');
        return executeWrap(intent, ctx.address, ctx.privateKey, onProgress);
      case 'unwrap':
        if (!intent.token || !intent.amount) throw new Error('Unwrap command is incomplete.');
        return executeUnwrap(intent, ctx.address, ctx.privateKey, onProgress);
      case 'claimAll':
        return executeClaimAll(intent, ctx.address, ctx.privateKey, ctx.tokens, onProgress);
      case 'revealBalance':
        return executeRevealBalance(intent, ctx.address, ctx.privateKey, ctx.tokens, onProgress);
      case 'checkBalance':
        return executeCheckBalance(intent, ctx.address, ctx.privateKey, ctx.tokens, onProgress);
      case 'switchNetwork':
        return executeSwitchNetwork(intent, onProgress);
      default:
        throw new Error('Unsupported action.');
    }
  } catch (e: unknown) {
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Transaction failed.',
    };
  }
}
