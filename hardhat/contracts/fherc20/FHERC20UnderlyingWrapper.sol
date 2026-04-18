// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FHERC20 } from "fhenix-confidential-contracts/contracts/FHERC20/FHERC20.sol";
import { FHERC20ERC20Wrapper } from "fhenix-confidential-contracts/contracts/FHERC20/extensions/FHERC20ERC20Wrapper.sol";

/// @notice FHERC20 wrapper for a single underlying ERC-20 (`shield` / `unshield` / `claimUnshielded`, etc.).
/// @dev Set `fherc20Decimals` to `min(underlyingDecimals, 6)` per `FHERC20ERC20Wrapper`.
contract FHERC20UnderlyingWrapper is FHERC20ERC20Wrapper {
    constructor(
        IERC20 underlyingToken,
        string memory name_,
        string memory symbol_,
        string memory contractURI_,
        uint8 fherc20Decimals_
    ) FHERC20(name_, symbol_, fherc20Decimals_, contractURI_) FHERC20ERC20Wrapper(underlyingToken) {}
}
