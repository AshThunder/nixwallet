import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import { decodeExternalTransaction } from './txDecode';

const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const network = {
  id: 'sepolia' as const,
  rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
  symbol: 'ETH',
};

describe('decodeExternalTransaction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes native ETH transfer', async () => {
    const tx = {
      to: '0x0000000000000000000000000000000000000001',
      value: ethers.toBeHex(ethers.parseEther('0.1')),
      data: '0x',
    };
    const decoded = await decodeExternalTransaction(tx, network);
    expect(decoded.type).toBe('send');
    expect(decoded.amount).toContain('0.1');
    expect(decoded.amount).toContain('ETH');
    expect(decoded.txStage).toBe('native-transfer');
  });

  it('uses allowlisted USDC metadata for ERC-20 transfer', async () => {
    const iface = new ethers.Interface(['function transfer(address,uint256)']);
    const data = iface.encodeFunctionData('transfer', [
      '0x0000000000000000000000000000000000000002',
      1_000_000n,
    ]);

    const decoded = await decodeExternalTransaction(
      { to: USDC, data, value: '0x0' },
      network,
    );

    expect(decoded.tokenSymbol).toBe('USDC');
    expect(decoded.amount).toContain('USDC');
    expect(decoded.txStage).toBe('erc20-transfer');
  });

  it('decodes shieldNative on configured native wrapper', async () => {
    const wrapper = '0x55Ee31F5706D91e0E48C48B5dBc6e14aD7afA3d2';
    const iface = new ethers.Interface(['function shieldNative(address) payable']);
    const data = iface.encodeFunctionData('shieldNative', [
      '0x0000000000000000000000000000000000000003',
    ]);

    const decoded = await decodeExternalTransaction(
      {
        to: wrapper,
        data,
        value: ethers.toBeHex(ethers.parseEther('0.01')),
      },
      network,
    );

    expect(decoded.type).toBe('wrap');
    expect(decoded.tokenSymbol).toBe('cETH');
    expect(decoded.isConfidential).toBe(true);
  });
});
