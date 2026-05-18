// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// Docs show @fhenixprotocol/confidential-contracts/... — same package as npm `fhenix-confidential-contracts@0.3.1`.
import { IWETH } from "fhenix-confidential-contracts/contracts/interfaces/IWETH.sol";
import { FHERC20 } from "fhenix-confidential-contracts/contracts/FHERC20/FHERC20.sol";
import { FHERC20NativeWrapper } from "fhenix-confidential-contracts/contracts/FHERC20/extensions/FHERC20NativeWrapper.sol";

/// @notice FHERC20 wrapper for native currency (ETH) via `shieldNative` / WETH via `shieldWrappedNative`.
contract FHERC20NativeUnderlyingWrapper is FHERC20NativeWrapper {
    constructor(IWETH weth_)
        FHERC20("Confidential ETH", "cETH", 6, "")
        FHERC20NativeWrapper(weth_)
    {}
}
